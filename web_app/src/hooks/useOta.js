import { useCallback, useState } from 'react';

const SVC_UUID  = '0000ff20-0000-1000-8000-00805f9b34fb';
const CTRL_UUID = '0000ff21-0000-1000-8000-00805f9b34fb';
const DATA_UUID = '0000ff22-0000-1000-8000-00805f9b34fb';

// Mirrors the firmware states in fw/src/ota.c
export const OTA_STATE = { RECEIVING: 1, VERIFYING: 2, READY: 3, ERROR: 4 };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Same algorithm as the firmware (poly 0xEDB88320, init 0xFFFFFFFF, xorout ~)
export function crc32(bytes) {
  let crc = -1; // 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      crc = ((crc >>> 1) ^ (0xEDB88320 & -(crc & 1))) | 0;
    }
  }
  return ~crc >>> 0;
}

// Extract the raw firmware image from a UF2 file (the same .uf2 used
// for BOOTSEL flashing), ordered by flash address.
export function parseUf2(buf) {
  const dv = new DataView(buf);
  const chunks = [];
  if (buf.byteLength === 0 || buf.byteLength % 512 !== 0) {
    throw new Error('geen geldig UF2-bestand');
  }
  for (let off = 0; off + 512 <= buf.byteLength; off += 512) {
    if (dv.getUint32(off, true) !== 0x0A324655 ||
        dv.getUint32(off + 4, true) !== 0x9E5D5157) {
      throw new Error('geen geldig UF2-bestand');
    }
    const flags = dv.getUint32(off + 8, true);
    if (flags & 0x8000) continue; // file-container block, no payload
    const addr = dv.getUint32(off + 12, true);
    const size = dv.getUint32(off + 16, true);
    if (size === 0 || size > 476) throw new Error('ongeldig UF2-blok');
    chunks.push({ addr, size, off: off + 32 });
  }
  if (chunks.length === 0) throw new Error('leeg UF2-bestand');
  chunks.sort((a, b) => a.addr - b.addr);
  const base = chunks[0].addr;
  const end = chunks[chunks.length - 1].addr + chunks[chunks.length - 1].size;
  const out = new Uint8Array(end - base);
  for (const c of chunks) {
    out.set(new Uint8Array(buf, c.off, c.size), c.addr - base);
  }
  return out;
}

/**
 * Streams a raw firmware image + its P-256 ECDSA signature (raw r||s,
 * 64 bytes) to the device's OTA service (GATT 0xFF20). The device
 * verifies both and reboots to apply the update.
 */
export function useOta({ getDevice, setOtaActive }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(null);
  const [log, setLog] = useState([]);

  const addLog = useCallback((msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('nl-NL', { hour12: false });
    setLog(l => [...l, { time, msg, type }]);
  }, []);

  const run = useCallback(async (bytes, sig, { label = 'Overbrengen' } = {}) => {
    setBusy(true);
    setProgress(0);
    setStatus('Verbinden met de update-service…');
    const started = Date.now();
    const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
    addLog(`Update gestart (${label.toLowerCase()}, ${bytes.length} bytes)`);
    try {
      const dev = getDevice();
      if (!dev?.gatt) throw new Error('niet verbonden met de oefen-AED');

      // Pause all other BLE traffic from this app for the duration
      setOtaActive?.(true);

      // Reconnect if the link dropped, then let it settle: right after a
      // (re)connect the phone is still doing GATT discovery, MTU exchange
      // and the device may just have started its classic-audio restore.
      if (!dev.gatt.connected) {
        addLog('Opnieuw verbinden met de oefen-AED…');
        await dev.gatt.connect();
        await sleep(1000);
      }
      addLog('Wachten tot de Bluetooth-verbinding stabiel is…');
      await sleep(2000);

      if (!dev.gatt.connected) throw new Error('verbinding verbroken tijdens de voorbereiding');
      addLog(`Apparaat: ${dev.name || 'onbekend'}, GATT verbonden`);

      // Resumable transfer: the iOS BLE transport drops or wedges a
      // variable way into a large transfer (supervision timeouts, hung
      // shims). Each round (re)connects, STARTs at the last device-
      // confirmed 4 kB boundary and streams as far as it gets; the
      // device keeps already-staged sectors. Repeat until complete.
      let finalState = null; // verdict via polled ctrl reads
      const stateName = { 1: 'ontvangst bevestigd', 2: 'controle CRC + handtekening', 3: 'gereed', 4: 'fout' };

      const q = new URLSearchParams(location.search);
      const dryRun = q.get('otaDryRun') === '1';
      const FLASH_BLOCK = Number(q.get('otaBlock')) > 0 ? Number(q.get('otaBlock')) : 4096;
      const SECTOR_WAIT_MS = Number(q.get('otaWait')) > 0 ? Number(q.get('otaWait')) : 3000;
      const MAX_ROUNDS = Number(q.get('otaRounds')) > 0 ? Number(q.get('otaRounds')) : 12;
      // iOS Web Bluetooth shims can leave a GATT promise pending
      // forever (wedged write/read/connect). Every operation gets a
      // timeout so a wedge becomes a failed round that the resume
      // machinery retries, instead of an eternal hang.
      const GATT_TIMEOUT_MS = 6000;
      const withTimeout = (op, what = 'gatt-operatie') => {
        let timer = null;
        return Promise.race([
          op,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${what} reageert niet (${GATT_TIMEOUT_MS / 1000}s)`)), GATT_TIMEOUT_MS);
          }),
        ]).finally(() => clearTimeout(timer));
      };
      const readCtrl = async (ctrl) => {
        const v = await withTimeout(ctrl.readValue(), 'statuslezing');
        return {
          state: v.getUint8(0),
          received: v.getUint32(1, true),
          error: v.getUint8(5),
          stagedCrc: v.byteLength >= 10 ? v.getUint32(6, true) : null,
        };
      };

      // Image + signature as one continuous blob
      if (!sig || sig.length !== 64) {
        throw new Error('geen geldige handtekening (64 bytes vereist)');
      }
      const blob = new Uint8Array(bytes.length + 64);
      blob.set(bytes, 0);
      blob.set(sig, bytes.length);
      let lastReported = 0;

      let chunk = 0;
      let confirmed = 0; // device-confirmed bytes (4 kB aligned)
      let round = 0;
      let ctrl = null;

      while (confirmed < blob.length && round < MAX_ROUNDS) {
        round++;
        try {
          // Never trust dev.gatt.connected: after a silent link drop
          // the iOS shim still reports connected and every GATT request
          // goes into the void. Force a clean disconnect -> reconnect
          // at the start of every round.
          try { dev.gatt.disconnect(); } catch (_) { /* best effort */ }
          await sleep(400);
          addLog(`Schoon opnieuw verbinden (ronde ${round})…`);
          await withTimeout(dev.gatt.connect(), 'herverbinding');
          await sleep(1500);
          if (!dev.gatt.connected) throw new Error('herverbinding mislukt');
          addLog(`OTA-service opzoeken (0xFF20)… (ronde ${round})`);
          const svc = await withTimeout(dev.gatt.getPrimaryService(SVC_UUID), 'service');
          ctrl = await withTimeout(svc.getCharacteristic(CTRL_UUID), 'kenmerk');
          const data = await withTimeout(svc.getCharacteristic(DATA_UUID), 'kenmerk');
          // No notifications: progress comes from polled ctrl reads.
          // Re-subscribing on every round wedges some iOS shims.

          if (chunk === 0) {
            // MTU probe (BLEOTA-style): without-response fails fast where
            // an oversized writeValue would hang the iOS shim.
            for (const candidate of [244, 180, 128, 64, 20]) {
              try {
                await data.writeValueWithoutResponse(new Uint8Array(candidate));
                chunk = candidate;
                break;
              } catch (_) { /* try the next smaller size */ }
            }
            if (!chunk) chunk = 20;
            addLog(`MTU-probe: ${chunk} bytes per schrijfactie`);
          }

          // Device-authoritative resume: the device remembers how much
          // of which image it staged (survives disconnects and page
          // reloads). Resume at the last confirmed 4 kB boundary of the
          // same image; start over if the image changed.
          const imageCrc = crc32(bytes);
          let resumeOff = confirmed;
          try {
            const st = await readCtrl(ctrl);
            if (st.stagedCrc === imageCrc) {
              const aligned = Math.floor(st.received / FLASH_BLOCK) * FLASH_BLOCK;
              if (aligned > resumeOff) {
                resumeOff = Math.min(aligned, blob.length);
                addLog(`Apparaat heeft al ${Math.round(resumeOff / 1024)} kB in staging — hervatten vanaf daar`);
              }
            } else if (st.stagedCrc !== null && st.stagedCrc !== 0 && st.received > 0) {
              addLog('Gestaged beeld is verouderd — opnieuw beginnen', 'warn');
            }
            if (resumeOff >= blob.length) {
              confirmed = blob.length; // fully staged already: go verify
            } else {
              confirmed = Math.max(confirmed, resumeOff);
            }
          } catch (_) { /* pre-read is best-effort */ }
          const cmd = new Uint8Array(dryRun ? 17 : 21);
          const cmdDv = new DataView(cmd.buffer);
          cmd[0] = 0x01;
          cmdDv.setUint32(1, bytes.length + 64, true); // total
          cmdDv.setUint32(5, imageCrc, true);          // crc of image bytes
          cmdDv.setUint32(9, bytes.length, true);      // image size
          if (dryRun) cmdDv.setUint32(13, 1, true);
          else cmdDv.setUint32(17, confirmed, true);   // resume offset
          await withTimeout(ctrl.writeValue(cmd), 'START');
          addLog(`START verstuurd${dryRun ? ' (DRY RUN)' : ''} ronde ${round}: verder vanaf ${confirmed} bytes, crc 0x${imageCrc.toString(16).padStart(8, '0')} [${elapsed()}]`);

          // Stream sectors with per-sector stop-and-wait (polled progress)
          for (let off = confirmed; off < blob.length; ) {
            const sectorEnd = Math.min(off + FLASH_BLOCK, blob.length);
            while (off < sectorEnd) {
              const part = blob.subarray(off, Math.min(off + chunk, sectorEnd));
              try {
                await withTimeout(data.writeValueWithoutResponse(part), 'schrijfactie');
              } catch (err) {
                const msg = String(err?.message ?? err);
                if (chunk > 20) {
                  chunk = chunk > 128 ? 128 : (chunk > 64 ? 64 : 20);
                  addLog(`Schrijffout op ${off} bytes (${msg}) — chunk verkleind naar ${chunk} bytes`, 'warn');
                  continue; // retry the same offset
                }
                throw err;
              }
              off += part.length;
              setProgress(off / blob.length);
            }
            if (sectorEnd < blob.length) {
              const deadline = Date.now() + SECTOR_WAIT_MS;
              for (;;) {
                const st = await readCtrl(ctrl);
                if (st.error !== 0) {
                  throw new Error(`apparaatfout 0x${st.error.toString(16)} op ${st.received} bytes`);
                }
                if (st.received >= sectorEnd) break;
                if (Date.now() > deadline) {
                  throw new Error(`apparaat volgt niet (${st.received} < ${sectorEnd} bytes)`);
                }
                await sleep(60);
              }
              confirmed = Math.max(confirmed, sectorEnd);
            }
            if (off - lastReported >= blob.length / 10 || off === blob.length) {
              lastReported = off;
              addLog(`Overgebracht: ${Math.round(off / 1024)} / ${Math.round(blob.length / 1024)} kB (${Math.round(off / blob.length * 100)}%) [${elapsed()}]`);
            }
          }
          confirmed = blob.length;
        } catch (roundErr) {
          const msg = roundErr?.message || roundErr;
          addLog(`Ronde ${round} afgebroken bij ${confirmed} bytes: ${msg}`, 'warn');
          if (/apparaatfout/.test(String(msg))) {
            throw roundErr; // device reported a protocol error — do not retry
          }
          await sleep(1500);
        }
      }
      if (confirmed < blob.length) {
        throw new Error(`overdracht niet voltooid na ${round} ronden (${confirmed} bytes)`);
      }
      addLog(`Alle ${blob.length} bytes overgebracht in ${round} ronde(s) [${elapsed()}]`);

      // FINISH [0x02] — device verifies CRC + signature, then reboots
      setStatus('Controleren…');
      await withTimeout(ctrl.writeValue(new Uint8Array([0x02])), 'FINISH');
      addLog('FINISH verstuurd — apparaat controleert CRC + handtekening');

      // Wait for the verdict: via notification when the browser delivers
      // them, otherwise by polling the readable ctrl state (some iOS Web
      // Bluetooth shims don't surface notifications during streaming).
      let polledState = null;
      const deadline = Date.now() + 30000;
      while (finalState === null && polledState === null && Date.now() < deadline) {
        await sleep(300);
        if (finalState !== null) break;
        if (!dev.gatt?.connected) {
          // The only code path that reboots the device after FINISH is a
          // passed CRC + signature verify, so a post-FINISH disconnect
          // means the update was accepted and the device is restarting.
          addLog('Verbinding verbroken na de controle — het apparaat past de update toe en start opnieuw op', 'ok');
          setProgress(1);
          setStatus('Update voltooid. De oefen-AED start opnieuw op met de nieuwe firmware.');
          return true;
        }
        try {
          const v = await ctrl.readValue();
          const s = v.getUint8(0);
          if (s === OTA_STATE.READY || s === OTA_STATE.ERROR) {
            polledState = s;
            addLog(`Eindstatus via polling: ${stateName[s] || s}`, s === OTA_STATE.ERROR ? 'err' : 'info');
          }
        } catch (_) { /* read may fail while the device reboots */ }
      }
      const verdict = finalState ?? polledState;

      if (verdict === OTA_STATE.ERROR) throw new Error('controle mislukt (CRC of handtekening)');
      if (verdict == null) throw new Error('geen antwoord van het apparaat');
      setProgress(1);
      if (dryRun) {
        addLog('DRY RUN geslaagd — alle bytes ontvangen, niets naar flash geschreven. Dit was een diagnostische test.', 'ok');
        setStatus('Dry-run geslaagd (diagnostisch).');
        return true;
      }
      addLog('Update geslaagd. De oefen-AED start opnieuw op met de nieuwe firmware.', 'ok');
      setStatus('Update geslaagd. De oefen-AED start opnieuw op met de nieuwe firmware.');
      return true;
    } catch (e) {
      const msg = e?.message || e;
      addLog(`Update mislukt: ${msg} [${((Date.now() - started) / 1000).toFixed(1)}s]`, 'err');
      setStatus(`Update mislukt: ${msg}`);
      return false;
    } finally {
      setOtaActive?.(false);
      setBusy(false);
    }
  }, [getDevice, addLog, setOtaActive]);

  return { busy, status, progress, run, setStatus, log, addLog };
}
