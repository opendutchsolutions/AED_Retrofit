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
export function useOta({ getDevice }) {
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
      if (!dev?.gatt?.connected) throw new Error('niet verbonden met de oefen-AED');
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
      const stateName = { 1: 'ontvangst bevestigd', 2: 'controle CRC + handtekening', 3: 'gereed', 4: 'fout' };
      const onNotify = (e) => {
        const s = e.target.value.getUint8(0);
        addLog(`Apparaatstatus: ${stateName[s] || s}`, s === OTA_STATE.ERROR ? 'err' : s === OTA_STATE.READY ? 'ok' : 'info');
        if (s === OTA_STATE.READY || s === OTA_STATE.ERROR) finalState = s;
      };
      ctrl.addEventListener('characteristicvaluechanged', onNotify);
      await ctrl.startNotifications();
      addLog('Meldingen geactiveerd op 0xFF21');

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
      let chunk = 240;
      let withoutResponse = true;
      let lastReported = 0;
      for (let off = 0, n = 0; off < blob.length; n++) {
        const part = blob.subarray(off, Math.min(off + chunk, blob.length));
        try {
          if (withoutResponse) {
            await data.writeValueWithoutResponse(part);
          } else {
            await data.writeValue(part);
          }
        } catch (err) {
          const msg = String(err?.message ?? err);
          // Some iOS Web Bluetooth implementations don't support
          // writeValueWithoutResponse — fall back to writeValue.
          if (withoutResponse && /support/i.test(msg)) {
            withoutResponse = false;
            addLog(`writeValueWithoutResponse niet ondersteund (${msg}) — overgeschakeld naar writeValue`);
            continue; // retry the same offset
          }
          // The negotiated ATT MTU varies per platform (iOS ~185, no API
          // to query it). Shrink the chunk until the write is accepted.
          if (chunk > 20) {
            chunk = chunk > 128 ? 128 : (chunk > 64 ? 64 : 20);
            addLog(`Schrijffout op ${off} bytes (${msg}) — chunk verkleind naar ${chunk} bytes`, 'warn');
            continue; // write failed → retry the same offset
          }
          throw err;
        }
        off += part.length;
        setProgress(off / blob.length);
        if (off - lastReported >= blob.length / 10 || off === blob.length) {
          lastReported = off;
          addLog(`Overgebracht: ${Math.round(off / 1024)} / ${Math.round(blob.length / 1024)} kB (${Math.round(off / blob.length * 100)}%) [${elapsed()}]`);
        }
        if (n % 16 === 0) await sleep(15);
      }
      addLog(`Alle ${blob.length} bytes overgebracht [${elapsed()}]`);

      // FINISH [0x02] — device verifies CRC + signature, then reboots
      setStatus('Controleren…');
      await ctrl.writeValue(new Uint8Array([0x02]));
      addLog('FINISH verstuurd — apparaat controleert CRC + handtekening');

      const deadline = Date.now() + 30000;
      while (finalState === null && Date.now() < deadline) await sleep(200);
      ctrl.removeEventListener('characteristicvaluechanged', onNotify);

      if (finalState === OTA_STATE.ERROR) throw new Error('controle mislukt (CRC)');
      if (finalState === null) throw new Error('geen antwoord van het apparaat');
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
      setBusy(false);
    }
  }, [getDevice, addLog]);

  return { busy, status, progress, run, setStatus, log, addLog };
}
