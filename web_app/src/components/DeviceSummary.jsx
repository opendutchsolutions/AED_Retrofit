import React, { useState } from 'react';
import { Card, Btn } from './UI';
import { parseUf2, useOta } from '../hooks/useOta';

// Served by the firmware workflow (fw → web_app/public/firmware)
const FIRMWARE_URL = `${import.meta.env.BASE_URL}firmware/picow-a2dp.uf2`;

function classicText(classicStatus) {
  if (classicStatus === null) return 'Onbekend';
  const known = (classicStatus & 1) !== 0;
  const connected = (classicStatus & 2) !== 0;
  if (connected) return 'Verbonden';
  if (known) return 'Gekoppeld, niet verbonden';
  return 'Niet gekoppeld';
}

export function DeviceSummary({ deviceName, classicStatus, getDevice }) {
  const { busy, status, progress, run, setStatus } = useOta({ getDevice });
  const [fetching, setFetching] = useState(false);

  async function updateFirmware() {
    setFetching(true);
    setStatus('Nieuwste firmware ophalen…');
    try {
      const resp = await fetch(FIRMWARE_URL);
      if (!resp.ok) throw new Error(`firmware niet gevonden (HTTP ${resp.status})`);
      const buf = await resp.arrayBuffer();
      const bytes = parseUf2(buf);
      await run(bytes);
    } catch (e) {
      setStatus(`Update mislukt: ${e.message}`);
    } finally {
      setFetching(false);
    }
  }

  const inProgress = busy || fetching;

  return (
    <Card>
      <h2>Apparaatoverzicht</h2>
      <dl className="summary-list">
        <div><dt>Apparaat</dt><dd>{deviceName || 'Oefen-AED'}</dd></div>
        <div><dt>Bluetooth</dt><dd>Verbonden</dd></div>
        <div><dt>Audio</dt><dd>{classicText(classicStatus)}</dd></div>
      </dl>

      <h3 style={{ marginTop: '1rem', marginBottom: '.5rem' }}>Firmware</h3>
      <div className="button-row">
        <Btn variant="primary" onClick={updateFirmware} disabled={inProgress}>
          {inProgress ? 'Bezig met bijwerken…' : 'Firmware bijwerken'}
        </Btn>
      </div>
      {progress != null && (
        <div
          style={{ background: '#eef1f4', borderRadius: '.35rem', height: '12px',
                   overflow: 'hidden', marginTop: '.6rem' }}
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
      <p className="hint">
        De nieuwste firmware wordt opgehaald van de server en draadloos naar de
        oefen-AED gestuurd. Het apparaat start na afloop zelf opnieuw op.
      </p>
    </Card>
  );
}
