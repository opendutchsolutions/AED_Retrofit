import React, { useEffect, useRef } from 'react';

const TYPE_COLORS = {
  info: 'inherit',
  warn: '#8a6100',
  err:  '#b3261e',
  ok:   '#1a7f37',
};

/**
 * Big, monospace, auto-scrolling log field that shows step-by-step
 * progress (e.g. during a firmware update). `entries` is an array of
 * { time, msg, type } objects as produced by useOta's addLog().
 */
export function LogField({ entries, label = 'Logboek', height = '220px' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);

  return (
    <div style={{ marginTop: '.8rem' }}>
      {label && (
        <div className="eyebrow" style={{ marginBottom: '.4rem' }}>{label}</div>
      )}
      <div
        ref={ref}
        role="log"
        aria-live="polite"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: '.78rem',
          lineHeight: 1.5,
          background: '#f7f9fb',
          border: '1px solid var(--border, #d9e0e6)',
          borderRadius: '.35rem',
          padding: '.6rem .75rem',
          height,
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {(!entries || entries.length === 0) ? (
          <span style={{ opacity: .55 }}>Nog geen activiteit…</span>
        ) : (
          entries.map((e, i) => (
            <div key={i} style={{ color: TYPE_COLORS[e.type] || 'inherit' }}>
              <span style={{ opacity: .6 }}>[{e.time}]</span> {e.msg}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
