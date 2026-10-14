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

      addLog('OTA-service opzoeken (0xFF20)…');
      let svc, ctrl, data;
      try {
        svc  = await dev.gatt.getPrimaryService(SVC_UUID);
        ctrl = await svc.getCharacteristic(CTRL_UUID);
        data = await svc.getCharacteristic(DATA_UUID);
      } catch (e) {
        addLog(`Service of kenmerk niet gevonden: ${e?.message || e}`, 'err');
        addLog('Tips: (1) zet Bluetooth op het iPhone/iPad kort uit en weer aan — iOS cachet de lijst met Bluetooth-services van dit apparaat en ziet zo nieuwe services pas na een cache-verversing; (2) verbind daarna opnieuw via de apparaatkeuze (Verbinden), niet via een opgeslagen verbinding.', 'warn');
        throw e;
      }
      addLog('Start- (0xFF21) en data-kenmerk (0xFF22) gevonden');

      let finalState = null;
      let ackCount = 0; // RECEIVING notifications: START ack + one per flushed sector
      const stateName = { 1: 'ontvangst bevestigd', 2: 'controle CRC + handtekening', 3: 'gereed', 4: 'fout' };
      const onNotify = (e) => {
        const s = e.target.value.getUint8(0);
        if (s === OTA_STATE.RECEIVING) {
          ackCount++;
          if (ackCount === 1) addLog('Apparaat bevestigt START (melding ontvangen)');
          return; // per-sector ACKs are counted, not logged
        }
        addLog(`Apparaatstatus: ${stateName[s] || s}`, s === OTA_STATE.ERROR ? 'err' : s === OTA_STATE.READY ? 'ok' : 'info');
        if (s === OTA_STATE.READY || s === OTA_STATE.ERROR) finalState = s;
      };
      ctrl.addEventListener('characteristicvaluechanged', onNotify);
      await ctrl.startNotifications();
      addLog('Meldingen geactiveerd op 0xFF21');

      // Probe the usable ATT payload like BLEOTA does: try
      // writeValueWithoutResponse with decreasing candidate sizes — it
      // fails fast where a too-large writeValue would hang the iOS shim.
      // Runs before START so the device ignores the probe writes.
      let chunk = 0;
      for (const candidate of [244, 180, 128, 64, 20]) {
        try {
          await data.writeValueWithoutResponse(new Uint8Array(candidate));
          chunk = candidate;
          break;
        } catch (_) { /* try the next smaller size */ }
      }
      if (!chunk) chunk = 20;
      addLog(`MTU-probe: ${chunk} bytes per schrijfactie`);

      // START [0x01][total_size:u32][crc32:u32][image_size:u32]
      // total = image + 64-byte signature appended; crc covers image only
      const cmd = new Uint8Array(13);
      const cmdDv = new DataView(cmd.buffer);
      const imageCrc = crc32(bytes);
      cmd[0] = 0x01;
      cmdDv.setUint32(1, bytes.length + 64, true);   // total
      cmdDv.setUint32(5, imageCrc, true);            // crc of image bytes
      cmdDv.setUint32(9, bytes.length, true);        // image size
      await ctrl.writeValue(cmd);
      addLog(`START verstuurd: ${bytes.length} + 64 bytes, crc 0x${imageCrc.toString(16).padStart(8, '0')} [${elapsed()}]`);

      setStatus(`${label} (${Math.ceil(bytes.length / 1024)} kB)…`);
      // Stream image + signature as one continuous blob
      const blob = new Uint8Array(bytes.length + 64);
      blob.set(bytes, 0);
      if (!sig || sig.length !== 64) {
        throw new Error('geen geldige handtekening (64 bytes vereist)');
      }
      blob.set(sig, bytes.length);
      let lastReported = 0;
      // BLEOTA-style per-sector stop-and-wait, with the progress signal
      // POLLED instead of notification-based (iOS notification delivery
      // is unreliable):
      //  - write one 4 kB sector with writeValueWithoutResponse (never
      //    errors or hangs on iOS; resolves when queued)
      //  - then poll the readable ctrl value [state, received:u32, error]
      //    until the device reports the sector as committed
      //  - no data is in flight while the device erases+programs flash,
      //    so the radio queue never collides with the flash stall
      const q = new URLSearchParams(location.search);
      const FLASH_BLOCK = Number(q.get('otaBlock')) > 0 ? Number(q.get('otaBlock')) : 4096;
      const SECTOR_WAIT_MS = Number(q.get('otaWait')) > 0 ? Number(q.get('otaWait')) : 3000;
      const readCtrl = async () => {
        const v = await ctrl.readValue();
        return { state: v.getUint8(0), received: v.getUint32(1, true), error: v.getUint8(5) };
      };
      addLog(`Protocol: per-sector stop-and-wait, chunks ${chunk} B, blok ${FLASH_BLOCK / 1024} kB`);
      for (let off = 0; off < blob.length; ) {
        const sectorEnd = Math.min(off + FLASH_BLOCK, blob.length);
        while (off < sectorEnd) {
          const part = blob.subarray(off, Math.min(off + chunk, sectorEnd));
          try {
            await data.writeValueWithoutResponse(part);
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
          // Wait until the device confirms the sector is on flash
          const deadline = Date.now() + SECTOR_WAIT_MS;
          for (;;) {
            const st = await readCtrl();
            if (st.error !== 0) {
              throw new Error(`apparaatfout 0x${st.error.toString(16)} op ${st.received} bytes`);
            }
            if (st.received >= sectorEnd) break;
            if (Date.now() > deadline) {
              throw new Error(`apparaat volgt niet (${st.received} < ${sectorEnd} bytes)`);
            }
            await sleep(60);
          }
        }
        if (off - lastReported >= blob.length / 10 || off === blob.length) {
          lastReported = off;
          addLog(`Overgebracht: ${Math.round(off / 1024)} / ${Math.round(blob.length / 1024)} kB (${Math.round(off / blob.length * 100)}%) [${elapsed()}]`);
        }
      }
      addLog(`Alle ${blob.length} bytes overgebracht [${elapsed()}]`);

      // FINISH [0x02] — device verifies CRC + signature, then reboots
      setStatus('Controleren…');
      await ctrl.writeValue(new Uint8Array([0x02]));
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
          ctrl.removeEventListener('characteristicvaluechanged', onNotify);
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
      ctrl.removeEventListener('characteristicvaluechanged', onNotify);

      if (verdict === OTA_STATE.ERROR) throw new Error('controle mislukt (CRC of handtekening)');
      if (verdict == null) throw new Error('geen antwoord van het apparaat');
      setProgress(1);
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
