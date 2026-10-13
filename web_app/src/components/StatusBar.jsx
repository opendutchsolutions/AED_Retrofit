import React from 'react';
import { Card, Btn } from './UI';

const STATUS_TEXT = {
  disconnected: 'Niet verbonden',
  scanning: 'Zoeken…',
  connected: 'Verbonden',
};

export function StatusChip({ status, deviceName }) {
  const stateClass = status === 'connected' ? 'connected' : status === 'scanning' ? 'scanning' : '';
  const label = status === 'connected' && deviceName ? deviceName : STATUS_TEXT[status];
  return (
    <div
      className={`status-chip ${stateClass}`}
      role="status"
      aria-live="polite"
    >
      <span className="status-dot" aria-hidden="true" />
      {label || STATUS_TEXT.disconnected}
    </div>
  );
}

export function ConnectCard({ status, deviceName, onConnect, onDisconnect, knownDevices, onReconnect, available }) {
  const connected = status === 'connected';
  const unavailable = available === false;
  const reconnectable = !connected && !unavailable && (knownDevices?.length ?? 0) > 0;

  return (
    <Card primary>
      <h2>Verbinden via Bluetooth</h2>
      <p>Zet de oefen-AED aan en houd deze dichtbij.</p>
      <ol className="steps">
        <li>Zet Bluetooth aan op dit apparaat.</li>
        <li>Zet de oefen-AED aan.</li>
        <li>Kies hieronder <strong>Zoek oefen-AED</strong>.</li>
      </ol>
      {!connected && (
        <Btn variant="primary" onClick={onConnect} disabled={status === 'scanning' || unavailable}>
          Zoek oefen-AED
        </Btn>
      )}
      {connected && <Btn variant="secondary" onClick={onDisconnect}>Verbinding verbreken</Btn>}

      {reconnectable && (
        <>
          <p style={{ marginTop: '1rem', fontWeight: 'bold' }}>Eerder verbonden apparaten</p>
          <div className="button-row">
            {knownDevices.map(d => (
              <Btn key={d.id} variant="secondary" onClick={() => onReconnect(d)}>
                Opnieuw verbinden{d.name ? ` — ${d.name}` : ''}
              </Btn>
            ))}
          </div>
        </>
      )}

      <div
        className={`message ${connected ? 'success' : unavailable ? 'error' : ''}`}
        role="status"
      >
        {connected
          ? `Verbonden met ${deviceName || 'de oefen-AED'}.`
          : status === 'scanning'
            ? 'Zoeken naar de oefen-AED…'
            : unavailable
              ? 'Bluetooth is niet beschikbaar op dit apparaat. Zet Bluetooth aan of gebruik de simulatiestand.'
              : 'Nog niet verbonden.'}
      </div>
    </Card>
  );
}
