import React from 'react';
import { Card, Divider } from './UI';

const LED_DEFS = [
  { key: 'shock',     bit: 0, label: 'Schok' },
  { key: 'on_off',    bit: 1, label: 'Aan/uit' },
  { key: 'info',      bit: 2, label: 'Info' },
  { key: 'hands_off', bit: 3, label: 'Handen af' },
  { key: 'low_belly', bit: 4, label: 'Onderbuik' },
  { key: 'breast',    bit: 5, label: 'Borst' },
];

const BTN_DEFS = [
  { key: 'shock',         bit: 0, icon: '⚡',  label: 'Schok',      hint: 'Simuleer schokknop' },
  { key: 'on_off',        bit: 1, icon: '⏻',  label: 'Aan/uit',    hint: 'Simuleer aan/uitknop' },
  { key: 'info',          bit: 2, icon: 'i',  label: 'Informatie', hint: 'Simuleer infoknop' },
  { key: 'card_slot',     bit: 3, icon: '▣',  label: 'Kaartslot',  hint: 'Simuleer kaartplaatsing' },
  { key: 'pads_inserted', bit: 4, icon: '◎',  label: 'Elektroden', hint: 'Simuleer aansluiting' },
];

export function LedStatusCard({ ledMask }) {
  const buzzerOn = !!(ledMask & (1 << 6));
  return (
    <Card>
      <h2>LED-lampjes</h2>
      <p className="hint">Kleur en tekst geven samen de status aan.</p>
      <ul className="led-list">
        {LED_DEFS.map(({ key, bit, label }) => (
          <li key={key}>
            <span className={`led-light${(ledMask & (1 << bit)) ? ' on' : ''}`} aria-hidden="true" />
            {label}
          </li>
        ))}
        <li>
          <span className="toggle-indicator" aria-hidden="true" style={{ background: buzzerOn ? '#198754' : '#687386' }} />
          Zoemer <strong>{buzzerOn ? 'aan' : 'uit'}</strong>
        </li>
      </ul>
    </Card>
  );
}

export function HardwarePanel({ ledMask, btnMask, onToggleLed, onPressBtn, readOnly }) {
  const buzzerOn = !!(ledMask & (1 << 6));

  return (
    <Card>
      <h2>Knoppen en sensoren</h2>
      <p className="hint" style={{ marginBottom: '.8rem' }}>
        Simuleer de fysieke knoppen en sensoren. Iedere actie verschijnt in het logboek.
      </p>
      <div className="control-grid">
        {BTN_DEFS.map(({ key, bit, icon, label, hint }) => {
          const active = !!(btnMask & (1 << bit));
          return (
            <button
              key={key}
              className={`device-control${key === 'shock' ? ' shock' : ''}`}
              onClick={() => onPressBtn(bit)}
              disabled={readOnly}
              title={active ? undefined : hint}
            >
              <span className="control-icon" aria-hidden="true">{icon}</span>
              <strong>{label}</strong>
              <small>{active ? 'Ingedrukt' : hint}</small>
            </button>
          );
        })}
      </div>

      <Divider />

      <h2>LED-lampjes en zoemer</h2>
      <p className="hint">Kleur en tekst geven samen de status aan.</p>
      <ul className="led-list">
        {LED_DEFS.map(({ key, bit, label }) => {
          const on = !!(ledMask & (1 << bit));
          return (
            <li key={key}>
              <button
                type="button"
                className="led-button"
                onClick={readOnly ? undefined : () => onToggleLed(bit)}
                disabled={readOnly}
                style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.55rem', border: '1px solid var(--border)' }}
                title={readOnly ? undefined : `${label} ${on ? 'uit' : 'aan'}zetten`}
              >
                <span className={`led-light${on ? ' on' : ''}`} aria-hidden="true" />
                {label}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="toggle-button"
            aria-pressed={buzzerOn}
            onClick={readOnly ? undefined : () => onToggleLed(6)}
            disabled={readOnly}
            style={{ minHeight: 'auto' }}
            title={readOnly ? undefined : `Zoemer ${buzzerOn ? 'uit' : 'aan'}zetten`}
          >
            <span className="toggle-indicator" aria-hidden="true" />
            Zoemer <strong>{buzzerOn ? 'aan' : 'uit'}</strong>
          </button>
        </li>
      </ul>
    </Card>
  );
}
