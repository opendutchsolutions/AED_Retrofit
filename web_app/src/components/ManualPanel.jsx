import React, { useState } from 'react';
import { Card, SectionLabel, Btn, Divider } from './UI';
import { AUDIO_FILES, LANGUAGES } from '../scenario/default';

const LED_KEYS = [
  { key: 'shock',     bit: 0, label: 'Shock' },
  { key: 'on_off',    bit: 1, label: 'On/Off' },
  { key: 'info',      bit: 2, label: 'Info' },
  { key: 'hands_off', bit: 3, label: 'Hands off' },
  { key: 'low_belly', bit: 4, label: 'Low belly' },
  { key: 'breast',    bit: 5, label: 'Breast' },
];

export function ManualPanel({ ledMask, onToggleLed, onAllOff, onPlayAudio, disabled }) {
  const [lang, setLang] = useState('Nederlands');

  const audioMap = AUDIO_FILES[lang] || {};

  return (
    <Card>
      <SectionLabel>Manual control</SectionLabel>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 6 }}>LED overrides</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {LED_KEYS.map(({ key, bit, label }) => {
            const on = !!(ledMask & (1 << bit));
            return (
              <button
                key={key}
                onClick={() => onToggleLed(bit)}
                disabled={disabled}
                style={{
                  padding: '4px 10px', borderRadius: 'var(--radius)', fontSize: 12,
                  border: `1px solid ${on ? 'var(--green-border)' : 'var(--border2)'}`,
                  background: on ? 'var(--green-bg)' : 'var(--bg3)',
                  color: on ? 'var(--green)' : 'var(--text2)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                  fontFamily: 'var(--font)',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            );
          })}
          <Btn small variant="ghost" onClick={onAllOff} disabled={disabled}>All off</Btn>
        </div>
      </div>

      <Divider />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', flex: 1 }}>Play audio</div>
        <select value={lang} onChange={e => setLang(e.target.value)} style={{ fontSize: 12, padding: '3px 8px' }}>
          {LANGUAGES.map(l => <option key={l}>{l}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(audioMap).map(([key, src]) => (
          <Btn key={key} small variant="ghost" onClick={() => onPlayAudio(src)} disabled={disabled}>
            {key.replace(/_/g, ' ')}
          </Btn>
        ))}
      </div>
    </Card>
  );
}
