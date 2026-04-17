import React from 'react';
import { Card, SectionLabel, Divider } from './UI';

const LED_DEFS = [
  { key: 'shock',     bit: 0, label: 'Shock' },
  { key: 'on_off',    bit: 1, label: 'On/Off' },
  { key: 'info',      bit: 2, label: 'Info' },
  { key: 'hands_off', bit: 3, label: 'Hands off' },
  { key: 'low_belly', bit: 4, label: 'Low belly' },
  { key: 'breast',    bit: 5, label: 'Breast' },
];

const BTN_DEFS = [
  { key: 'shock',         bit: 0, label: 'Shock',    type: 'btn' },
  { key: 'on_off',        bit: 1, label: 'On/Off',   type: 'btn' },
  { key: 'info',          bit: 2, label: 'Info',     type: 'btn' },
  { key: 'card_slot',     bit: 3, label: 'Card slot', type: 'sensor' },
  { key: 'pads_inserted', bit: 4, label: 'Pads',     type: 'sensor' },
];

function LedDot({ on, onClick, label }) {
  return (
    <div
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '9px 6px', borderRadius: 'var(--radius)',
        border: `1px solid ${on ? 'var(--green-border)' : 'var(--border)'}`,
        background: on ? 'var(--green-bg)' : 'var(--bg3)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s', userSelect: 'none',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: on ? 'var(--green)' : 'var(--bg4)',
        boxShadow: on ? '0 0 0 3px var(--green-bg)' : 'none',
        transition: 'all 0.15s',
      }} />
      <span style={{ fontSize: 10, color: on ? 'var(--green)' : 'var(--text3)', textAlign: 'center', lineHeight: 1.2 }}>
        {label}
      </span>
    </div>
  );
}

function BtnDot({ active, label, type }) {
  const isBtn = type === 'btn';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
      padding: '9px 6px', borderRadius: 'var(--radius)',
      border: `1px solid ${active ? (isBtn ? 'var(--red-border)' : 'var(--blue-border)') : 'var(--border)'}`,
      background: active ? (isBtn ? 'var(--red-bg)' : 'var(--blue-bg)') : 'var(--bg3)',
      transition: 'all 0.15s',
    }}>
      <div style={{
        width: 16, height: 16, borderRadius: '50%',
        background: active ? (isBtn ? 'var(--red)' : 'var(--blue)') : 'var(--bg4)',
        transition: 'all 0.15s',
      }} />
      <span style={{ fontSize: 10, color: active ? (isBtn ? 'var(--red)' : 'var(--blue)') : 'var(--text3)', textAlign: 'center', lineHeight: 1.2 }}>
        {label}
      </span>
    </div>
  );
}

function toHex(v) { return '0x' + v.toString(16).padStart(2, '0').toUpperCase(); }
function toBits(v) { return v.toString(2).padStart(8, '0'); }

export function HardwarePanel({ ledMask, btnMask, onToggleLed, readOnly }) {
  return (
    <Card>
      <SectionLabel>LEDs — 0xFF12</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {LED_DEFS.map(({ key, bit, label }) => (
          <LedDot
            key={key}
            on={!!(ledMask & (1 << bit))}
            label={label}
            onClick={readOnly ? undefined : () => onToggleLed(bit)}
          />
        ))}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
        {toHex(ledMask)} &nbsp; {toBits(ledMask)}
      </div>

      <Divider />

      <SectionLabel>Buttons — 0xFF11</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {BTN_DEFS.map(({ key, bit, label, type }) => (
          <BtnDot key={key} active={!!(btnMask & (1 << bit))} label={label} type={type} />
        ))}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
        {toHex(btnMask)} &nbsp; {toBits(btnMask)}
      </div>
    </Card>
  );
}
