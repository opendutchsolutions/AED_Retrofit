import React, { useRef, useEffect, useState } from 'react';
import { Card, Btn } from './UI';

const TYPE_CLASS = {
  ok: 'log-ok',
  err: 'log-err',
  warn: 'log-warn',
};

export function SessionLog({ entries, onClear }) {
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!collapsed) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, collapsed]);

  return (
    <Card className="log-card">
      <div className="card-heading">
        <div>
          <h2>Activiteitenlogboek</h2>
          <p className="muted">{entries.length} gebeurtenissen</p>
        </div>
        <div className="button-row">
          <Btn small variant="secondary" onClick={onClear}>Logboek wissen</Btn>
          <Btn small variant="secondary" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? 'Uitklappen' : 'Inklappen'}
          </Btn>
        </div>
      </div>

      {!collapsed && (
        <ol className="log-list">
          {entries.length === 0 && <li className="empty-log">Nog geen gebeurtenissen.</li>}
          {entries.map(e => (
            <li key={e.id} className={TYPE_CLASS[e.type] || ''}>
              <span className="log-time">{e.t}</span>
              {e.msg}
            </li>
          ))}
          <li ref={bottomRef} aria-hidden="true" style={{ listStyle: 'none' }} />
        </ol>
      )}
    </Card>
  );
}
