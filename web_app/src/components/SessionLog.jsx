import React, { useRef, useEffect, useState } from 'react';
import { Card, SectionLabel, Btn } from './UI';

const TYPE_COLOR = {
  ok:     'var(--green)',
  err:    'var(--red)',
  warn:   'var(--amber)',
  step:   'var(--blue)',
  branch: 'var(--purple)',
  dbg:    'var(--text3)',
  '':     'var(--text2)',
};

export function SessionLog({ entries, onClear }) {
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!collapsed) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, collapsed]);

  return (
    <Card style={{ padding: '0.75rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: collapsed ? 0 : 8 }}>
        <SectionLabel style={{ marginBottom: 0, flex: 1 }}>Session log</SectionLabel>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{entries.length} events</span>
        <Btn small variant="ghost" onClick={onClear}>Clear</Btn>
        <Btn small variant="ghost" onClick={() => setCollapsed(c => !c)}>{collapsed ? '▸' : '▾'}</Btn>
      </div>

      {!collapsed && (
        <div style={{
          maxHeight: 160, overflowY: 'auto',
          fontFamily: 'var(--mono)', fontSize: 11, lineHeight: 1.7,
        }}>
          {entries.length === 0 && (
            <div style={{ color: 'var(--text3)', padding: '8px 0' }}>No events yet.</div>
          )}
          {entries.map(e => (
            <div key={e.id} style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--text3)', flexShrink: 0 }}>{e.t}</span>
              <span style={{ color: TYPE_COLOR[e.type] || 'var(--text2)' }}>{e.msg}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </Card>
  );
}
