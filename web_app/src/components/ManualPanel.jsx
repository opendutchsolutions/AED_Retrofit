import React, { useState } from 'react';
import { Card, Btn, Divider } from './UI';
import { AUDIO_FILES, LANGUAGES } from '../scenario/default';

const LED_KEYS = [
  { key: 'shock',     bit: 0, label: 'Schok' },
  { key: 'on_off',    bit: 1, label: 'Aan/uit' },
  { key: 'info',      bit: 2, label: 'Info' },
  { key: 'hands_off', bit: 3, label: 'Handen af' },
  { key: 'low_belly', bit: 4, label: 'Onderbuik' },
  { key: 'breast',    bit: 5, label: 'Borst' },
  { key: 'buzzer',    bit: 6, label: 'Zoemer' },
];

export function ManualPanel({ ledMask, onToggleLed, onAllOff, onPlayAudio, disabled }) {
  const [lang, setLang] = useState('Nederlands');

  const audioMap = AUDIO_FILES[lang] || {};

  return (
    <Card>
      <h2>Handmatige bediening</h2>
      <p className="hint">Schakel afzonderlijke LED-lampjes aan of uit en speel audio af.</p>

      <div className="chip-grid" style={{ marginTop: '.8rem' }}>
        {LED_KEYS.map(({ key, bit, label }) => {
          const on = !!(ledMask & (1 << bit));
          return (
            <button
              key={key}
              className="chip-button"
              onClick={() => onToggleLed(bit)}
              disabled={disabled}
              aria-pressed={on}
            >
              {label}
            </button>
          );
        })}
        <Btn small variant="secondary" onClick={onAllOff} disabled={disabled}>Alle lampjes uit</Btn>
      </div>

      <Divider />

      <div className="field" style={{ maxWidth: '20rem' }}>
        <label htmlFor="audio-language">Taal van de audio</label>
        <select id="audio-language" value={lang} onChange={e => setLang(e.target.value)}>
          {LANGUAGES.map(l => <option key={l}>{l}</option>)}
        </select>
      </div>
      <h3>Audio afspelen</h3>
      <div className="chip-grid" style={{ marginTop: '.5rem' }}>
        {Object.entries(audioMap).map(([key, src]) => (
          <button
            key={key}
            className="chip-button"
            onClick={() => onPlayAudio(src)}
            disabled={disabled}
          >
            {key.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {disabled && <p className="hint">Verbind eerst met de oefen-AED om audio af te spelen.</p>}
    </Card>
  );
}
