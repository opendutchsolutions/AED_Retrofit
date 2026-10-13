// Shared firmware-version helpers for the OTA UI.
// The firmware workflow publishes these files into web_app/public/firmware.

export const FIRMWARE_URL = `${import.meta.env.BASE_URL}firmware/picow-a2dp.uf2`;
export const SIGNATURE_URL = `${import.meta.env.BASE_URL}firmware/picow-a2dp.sig`;
export const VERSION_URL = `${import.meta.env.BASE_URL}firmware/version.json`;

// Compare "X.Y.Z" version strings: returns true if `a` is newer than `b`
export function isNewer(a, b) {
  if (!a || !b) return true; // unknown → assume update available
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na !== nb) return na > nb;
  }
  return false;
}

// Fetch the firmware version published by CI; null when unavailable
export async function fetchServerVersion() {
  try {
    const r = await fetch(VERSION_URL);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.version ?? null;
  } catch {
    return null;
  }
}
