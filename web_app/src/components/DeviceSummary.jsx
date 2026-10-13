import React, { useState } from 'react';
import { Card, Btn } from './UI';
import { LogField } from './LogField';
import { parseUf2, useOta } from '../hooks/useOta';
import { FIRMWARE_URL, SIGNATURE_URL, isNewer, fetchServerVersion, fetchFirmwareArtifact } from '../firmware';

function classicText(classicStatus) {
  if (classicStatus === null) return 'Onbekend';
  const known = (classicStatus & 1) !== 0;
  const connected = (classicStatus & 2) !== 0;
  if (connected) return 'Verbonden';
  if (known) return 'Gekoppeld, niet verbonden';
  return 'Niet gekoppeld';
}

export function DeviceSummary({ deviceName, classicStatus, fwVersion, getDevice }) {
  const { busy, status, progress, run, setStatus, log, addLog } = useOta({ getDevice });
  const [fetching, setFetching] = useState(false);
  const [serverVersion, setServerVersion] = useState(null);

  // Fetch the available firmware version once, to decide if an update exists
  React.useEffect(() => {
    fetchServerVersion().then(v => {
      setServerVersion(v);
      if (v) addLog(`Nieuwste firmware op de server: v${v}`);
    });
  }, [addLog]);

  const updateAvailable = isNewer(serverVersion, fwVersion);

  async function updateFirmware() {
    setFetching(true);
    setStatus('Nieuwste firmware ophalen…');
    addLog(`Firmware ophalen: ${FIRMWARE_URL}`);
    try {
      const [fwResp, sigResp] = await Promise.all([
        fetchFirmwareArtifact(FIRMWARE_URL), fetchFirmwareArtifact(SIGNATURE_URL),
      ]);
      if (!fwResp.ok) throw new Error(`firmware niet gevonden (HTTP ${fwResp.status})`);
      if (!sigResp.ok) throw new Error(`handtekening niet gevonden (HTTP ${sigResp.status})`);
      const fwBuf = await fwResp.arrayBuffer();
      addLog(`Firmware gedownload: ${Math.round(fwBuf.byteLength / 1024)} kB`);
      const bytes = parseUf2(fwBuf);
      const sig = new Uint8Array(await sigResp.arrayBuffer());
      addLog(`UF2 uitgepakt: ${bytes.length} bytes image, ${sig.length} bytes handtekening`);
      await run(bytes, sig);
    } catch (e) {
      addLog(`Update mislukt: ${e?.message || e}`, 'err');
      setStatus(`Update mislukt: ${e?.message || e}`);
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
      <dl className="summary-list">
        <div><dt>Geïnstalleerde versie</dt><dd>{fwVersion || 'Onbekend'}</dd></div>
        <div><dt>Beschikbare versie</dt><dd>{serverVersion || 'Onbekend'}</dd></div>
      </dl>
      {updateAvailable ? (
        <>
          <div className="button-row">
            <Btn variant="primary" onClick={updateFirmware} disabled={inProgress}>
              {inProgress ? 'Bezig met bijwerken…' : 'Firmware bijwerken'}
            </Btn>
          </div>
          <p className="hint">
            De nieuwste, ondertekende firmware wordt opgehaald van de server en
            draadloos naar de oefen-AED gestuurd. Het apparaat controleert de
            handtekening en start daarna zelf opnieuw op.
          </p>
        </>
      ) : (
        <p className="message" role="status" style={{ marginBottom: 0 }}>
          Firmware is actueel.
        </p>
      )}
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
      <LogField entries={log} label="Update-logboek" />
    </Card>
  );
}
