import React from 'react';
import { Btn } from './UI';

export function StatusBar({ status, deviceName, onConnect, onDisconnect }) {
  const dot = {
    disconnected: '#5a6070',
    scanning: 'var(--amber)',
    connected: 'var(--green)',
  }[status] || '#5a6070';

  const pulse = status === 'scanning';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 14px',
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: dot, flexShrink: 0,
        animation: pulse ? 'blink 1s infinite' : 'none',
      }} />
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
      <span style={{ fontSize: 13, color: 'var(--text2)', flex: 1 }}>
        {status === 'connected' ? deviceName : status === 'scanning' ? 'Scanning…' : 'Not connected'}
      </span>
      {status === 'connected'
        ? <Btn variant="danger" small onClick={onDisconnect}>Disconnect</Btn>
        : <Btn variant="primary" small onClick={onConnect} disabled={status === 'scanning'}>Connect</Btn>
      }
    </div>
  );
}
