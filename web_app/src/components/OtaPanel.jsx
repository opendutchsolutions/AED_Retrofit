import React, { useRef, useState } from 'react';
import { Card, Btn } from './UI';
import { parseUf2, useOta } from '../hooks/useOta';

export function OtaPanel({ connected, getDevice }) {
  const { busy, status, progress, run, setStatus } = useOta({ getDevice });
  const fileRef = useRef(null);
  const [reading, setReading] = useState(false);

  async function startOta() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setStatus('Kies eerst een firmware-bestand.'); return; }
    setReading(true);
    setStatus('Bestand lezen…');
    try {
      const buf = await file.arrayBuffer();
      const bytes = /\.uf2$/i.test(file.name) ? parseUf2(buf) : new Uint8Array(buf);
      if (bytes.length === 0) throw new Error('leeg bestand');
      await run(bytes);
    } catch (e) {
      setStatus(`Update mislukt: ${e.message}`);
    } finally {
      setReading(false);
    }
  }

  return (
    <Card className="log-card">
      <h2>Firmware-update (OTA)</h2>
      <p className="hint">
        Kies een firmware-bestand (.uf2 of .bin) om de oefen-AED draadloos bij te
        werken. Het apparaat controleert het bestand en start daarna zelf opnieuw
        op. Verbreek de verbinding niet tijdens de update.
      </p>
      <div className="inline" style={{ marginTop: '.8rem' }}>
        <input
          type="file"
          accept=".uf2,.bin"
          ref={fileRef}
          disabled={busy || reading || !connected}
          aria-label="Firmware-bestand"
          style={{ flex: 1 }}
        />
        <Btn variant="primary" onClick={startOta} disabled={busy || reading || !connected}>
          Update starten
        </Btn>
      </div>
      {progress != null && (
        <div
          style={{ background: '#eef1f4', borderRadius: '.35rem', height: '12px',
                   overflow: 'hidden', marginTop: '.8rem' }}
          role="progressbar"
          aria-valuenow={Math.round((progress ?? 0) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              width: `${Math.round(progress * 100)}%`, height: '100%',
              background: 'var(--primary)', transition: 'width .2s',
            }}
          />
        </div>
      )}
      {status && (
        <p className="message" role="status" style={{ marginBottom: 0 }}>{status}</p>
      )}
    </Card>
  );
}
