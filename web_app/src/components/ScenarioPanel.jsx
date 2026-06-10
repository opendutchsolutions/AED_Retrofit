import React from 'react';
import { Card, SectionLabel, Btn, Badge, Divider } from './UI';

function formatTime(s) {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2,'0')}` : `${sec}s`;
}

const TYPE_BADGE = {
  button: { label: 'awaiting button', color: 'amber' },
  timed:  { label: 'timed',          color: 'blue'  },
  branch: { label: 'branch',         color: 'purple' },
  end:    { label: 'complete',       color: 'green'  },
};

export function ScenarioPanel({
  running, currentStep, waitingBranch, timeLeft,
  onStart, onStop, onChooseBranch,
  language, onLanguageChange,
  connected,
}) {
  const badge = currentStep ? TYPE_BADGE[currentStep.type] : null;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <SectionLabel style={{ marginBottom: 0, flex: 1 }}>Scenario</SectionLabel>
        <select
          value={language}
          onChange={e => onLanguageChange(e.target.value)}
          disabled={running}
          style={{ fontSize: 12, padding: '3px 8px' }}
        >
          <option>Nederlands</option>
          <option>Duits</option>
        </select>
        {!running
          ? <Btn variant={connected ? 'success' : 'amber'} onClick={onStart}>
              {connected ? 'Start session' : 'Simulate'}
            </Btn>
          : <Btn variant="danger" onClick={onStop}>Stop</Btn>
        }
      </div>

      {!running && !currentStep && (
        <div style={{ color: 'var(--text3)', fontSize: 13, padding: '24px 0', textAlign: 'center' }}>
          {connected
            ? 'Press Start session to begin.'
            : 'Press Simulate to run without hardware, or connect a device first.'}
        </div>
      )}

      {currentStep && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{currentStep.label}</div>
              <div style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.5 }}>{currentStep.instruction}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {badge && <Badge color={badge.color}>{badge.label}</Badge>}
              {timeLeft != null && (
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 500,
                  color: timeLeft <= 10 ? 'var(--red)' : 'var(--text)',
                }}>
                  {formatTime(timeLeft)}
                </div>
              )}
            </div>
          </div>

          {waitingBranch && currentStep.choices && (
            <>
              <Divider />
              <SectionLabel>Select outcome</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {currentStep.choices.map((c, i) => (
                  <Btn
                    key={i}
                    variant={i === 0 ? 'danger' : 'primary'}
                    onClick={() => onChooseBranch(c.next)}
                    style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                  >
                    {c.label}
                  </Btn>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}
