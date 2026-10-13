import React, { useState } from 'react';
import { Card, Btn } from './UI';
import { parseUf2, useOta } from '../hooks/useOta';
import { FIRMWARE_URL, SIGNATURE_URL, isNewer, fetchServerVersion, fetchFirmwareArtifact } from '../firmware';

export function OtaPanel({ connected, fwVersion, getDevice }) {
  const { busy, status, progress, run, setStatus } = useOta({ getDevice });
  const [fetching, setFetching] = useState(false);
  const [serverVersion, setServerVersion] = useState(null);

  React.useEffect(() => {
    fetchServerVersion().then(setServerVersion);
  }, []);

  const updateAvailable = isNewer(serverVersion, fwVersion);
  const versionKnown = Boolean(serverVersion && fwVersion);

  async function startOta() {
    setFetching(true);
    setStatus('Nieuwste firmware ophalen…');
    try {
      const [fwResp, sigResp] = await Promise.all([
        fetchFirmwareArtifact(FIRMWARE_URL), fetchFirmwareArtifact(SIGNATURE_URL),
      ]);
      if (!fwResp.ok) throw new Error(`firmware niet gevonden (HTTP ${fwResp.status})`);
      if (!sigResp.ok) throw new Error(`handtekening niet gevonden (HTTP ${sigResp.status})`);
      const bytes = parseUf2(await fwResp.arrayBuffer());
      const sig = new Uint8Array(await sigResp.arrayBuffer());
      await run(bytes, sig);
    } catch (e) {
      setStatus(`Update mislukt: ${e?.message || e}`);
    } finally {
      setFetching(false);
    }
  }

  const inProgress = busy || fetching;

  return (
    <Card className="log-card">
      <h2>Firmware-update (OTA)</h2>
      <dl className="summary-list">
        <div><dt>Geïnstalleerde versie</dt><dd>{fwVersion || 'Onbekend'}</dd></div>
        <div><dt>Beschikbare versie</dt><dd>{serverVersion || 'Onbekend'}</dd></div>
      </dl>
      {versionKnown && !updateAvailable ? (
        <p className="message" role="status" style={{ marginBottom: 0 }}>
          Firmware is actueel.
        </p>
      ) : (
        <>
          <p className="hint">
            Haalt de nieuwste, ondertekende firmware op van de server en stuurt
            die draadloos naar de oefen-AED. Het apparaat controleert de
            handtekening en start daarna zelf opnieuw op. Verbreek de verbinding
            niet tijdens de update.
          </p>
          <div className="button-row" style={{ marginTop: '.8rem' }}>
            <Btn variant="primary" onClick={startOta} disabled={inProgress || !connected}>
              {inProgress ? 'Bezig met bijwerken…' : 'Firmware bijwerken'}
            </Btn>
          </div>
        </>
      )}
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
