import React from 'react';
import { Card } from './UI';

// Positions measured from public/aed_pos.jpg (markings diffed against aed.jpg):
//   info button #b01e22, hands-off LED #dc00ff, lower breast LED #e8ff01,
//   upper breast LED #e4917e, pads port #0000b1, kindsleutel port #00c4b1.
// The green on/off and red shock button come from the buttons in the photo.
// x/y/w/h are percentages of the photo; slots (h set) render as a rounded bar.
const HOTSPOTS = [
  { key: 'on_off',    btn: 'on_off',        bit: 1, ledBit: 1,    x: 86,   y: 26.5, icon: '⏻', label: 'Aan/uit',     glow: '#1d8c58', w: 11 },
  { key: 'info',      btn: 'info',          bit: 2, ledBit: 2,    x: 69.2, y: 42.4, icon: 'i',  label: 'Informatie', glow: '#075985', w: 12 },
  { key: 'shock',     btn: 'shock',         bit: 0, ledBit: 0,    x: 85.5, y: 71.5, icon: '⚡', label: 'Schok',       glow: '#e07a2f', w: 10 },
  { key: 'pads',      btn: 'pads_inserted', bit: 4, ledBit: null, x: 15.6, y: 18.2, icon: '◎', label: 'Elektroden', glow: '#075985', w: 15, h: 6 },
  { key: 'child_key', btn: 'card_slot',     bit: 3, ledBit: null, x: 53.8, y: 17.8, icon: 'K', label: 'Kindsleutel', glow: '#075985', w: 12, h: 6 },
];

// Glow markers over the pad-placement illustration on the device front.
// LED bits: hands_off=3, low_belly=4, breast=5 (see hooks/useBLE.js).
const LED_MARKERS = [
  { key: 'hands_off', bit: 3, x: 69.2, y: 57.4, label: 'Handen af', size: 5, glow: '#e8862a' },
  { key: 'breast',    bit: 5, x: 49.9, y: 49.5, label: 'Borst',     size: 2.5 },
  { key: 'low_belly', bit: 4, x: 56.8, y: 56.0, label: 'Onderbuik', size: 2.5 },
];

export function AedDevicePanel({ ledMask, btnMask, expectedButton, onPressBtn, running }) {
  const buzzerOn = !!(ledMask & (1 << 6));

  return (
    <Card>
      <div className="card-heading">
        <div>
          <h2>Oefen-AED</h2>
          <p className="hint">Druk op de knoppen op de foto om ze te simuleren.</p>
        </div>
        <span className={`badge ${buzzerOn ? 'warning' : ''}`}>
          Zoemer {buzzerOn ? 'aan' : 'uit'}
        </span>
      </div>

      <div className="aed-photo" style={{ marginTop: '.8rem' }}>
        <img src="aed.jpg" alt="Oefen-AED met bedieningsknoppen" draggable={false} />

        {/* Arrow pointing at the electrode port */}
        <span className="hotspot-arrow" style={{ left: '15.6%', top: '11.5%' }} aria-hidden="true">↓</span>

        {HOTSPOTS.map(({ key, btn, bit, ledBit, x, y, icon, label, glow, w, h }) => {
          const pressed = !!(btnMask & (1 << bit));
          const lit = ledBit !== null && !!(ledMask & (1 << ledBit));
          const expected = running && expectedButton === btn;
          const isSlot = h !== undefined;
          const cls = [
            'hotspot',
            isSlot ? 'hotspot-wide' : '',
            lit ? 'led-on' : '',
            pressed ? 'pressed' : '',
            expected ? 'expected' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={key}
              className={cls}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                '--glow': glow,
                width: `${w}%`,
                ...(isSlot ? { height: `${h}%` } : { aspectRatio: '1' }),
              }}
              onClick={() => onPressBtn(bit)}
              title={`${label} simuleren`}
              aria-label={`${label} simuleren`}
            >
              <span className="hotspot-icon" aria-hidden="true">{icon}</span>
              <span className="hotspot-label">{label}</span>
            </button>
          );
        })}

        {LED_MARKERS.map(({ key, bit, x, y, label, size, glow }) => {
          const on = !!(ledMask & (1 << bit));
          return (
            <span
              key={key}
              className={`led-marker${on ? ' on' : ''}`}
              style={{ left: `${x}%`, top: `${y}%`, width: `${size}%`, ...(glow ? { '--glow': glow } : {}) }}
              role="img"
              aria-label={`${label}: ${on ? 'aan' : 'uit'}`}
            />
          );
        })}
      </div>
    </Card>
  );
}
