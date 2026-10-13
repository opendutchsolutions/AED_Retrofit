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
 * Streams a raw firmware image to the device's OTA service (GATT 0xFF20).
 * `bytes` is the raw image (use parseUf2 for .uf2 files).
 * The device verifies the CRC and reboots into the new firmware.
 */
export function useOta({ getDevice }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(null);

  const run = useCallback(async (bytes, { label = 'Overbrengen' } = {}) => {
    setBusy(true);
    setProgress(0);
    setStatus('Verbinden met de update-service…');
    try {
      const dev = getDevice();
      if (!dev?.gatt?.connected) throw new Error('niet verbonden met de oefen-AED');

      const svc  = await dev.gatt.getPrimaryService(SVC_UUID);
      const ctrl = await svc.getCharacteristic(CTRL_UUID);
      const data = await svc.getCharacteristic(DATA_UUID);

      let finalState = null;
      const onNotify = (e) => {
        const s = e.target.value.getUint8(0);
        if (s === OTA_STATE.READY || s === OTA_STATE.ERROR) finalState = s;
      };
      ctrl.addEventListener('characteristicvaluechanged', onNotify);
      await ctrl.startNotifications();

      // START [0x01][size][crc32]
      const cmd = new Uint8Array(9);
      const cmdDv = new DataView(cmd.buffer);
      cmd[0] = 0x01;
      cmdDv.setUint32(1, bytes.length, true);
      cmdDv.setUint32(5, crc32(bytes), true);
      await ctrl.writeValue(cmd);

      setStatus(`${label} (${Math.ceil(bytes.length / 1024)} kB)…`);
      let chunk = 240;
      for (let off = 0, n = 0; off < bytes.length; n++) {
        const part = bytes.subarray(off, Math.min(off + chunk, bytes.length));
        try {
          await data.writeValueWithoutResponse(part);
        } catch (err) {
          if (chunk > 20 && /length|mtu/i.test(err?.message || '')) {
            chunk = 20; // MTU too small for the big chunks
            continue;
          }
          throw err;
        }
        off += part.length;
        setProgress(off / bytes.length);
        if (n % 16 === 0) await sleep(15);
      }

      // FINISH [0x02] — device verifies CRC and reboots when OK
      setStatus('Controleren…');
      await ctrl.writeValue(new Uint8Array([0x02]));

      const deadline = Date.now() + 30000;
      while (finalState === null && Date.now() < deadline) await sleep(200);
      ctrl.removeEventListener('characteristicvaluechanged', onNotify);

      if (finalState === OTA_STATE.ERROR) throw new Error('controle mislukt (CRC)');
      if (finalState === null) throw new Error('geen antwoord van het apparaat');
      setProgress(1);
      setStatus('Update geslaagd. De oefen-AED start opnieuw op met de nieuwe firmware.');
      return true;
    } catch (e) {
      setStatus(`Update mislukt: ${e.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [getDevice]);

  return { busy, status, progress, run, setStatus };
}
