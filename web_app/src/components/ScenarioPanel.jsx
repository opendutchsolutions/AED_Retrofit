import React from 'react';
import { Card, Btn, Badge, Divider } from './UI';

function formatTime(s) {
  if (s == null) return null;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
}

const TYPE_BADGE = {
  button: { label: 'wacht op knop',    color: 'amber' },
  timed:  { label: 'automatische fase', color: 'blue' },
  branch: { label: 'keuzemoment',      color: 'purple' },
  end:    { label: 'afgerond',        color: 'green' },
};

export function ScenarioPanel({
  running, currentStep, waitingBranch, timeLeft,
  onStart, onStop, onChooseBranch, onSkipPhase,
  language, onLanguageChange,
  metronome, onMetronomeChange,
  connected,
}) {
  const badge = currentStep ? TYPE_BADGE[currentStep.type] : null;
  const isTimedPhase = running && currentStep?.type === 'timed';

  return (
    <Card>
      <h2>Instructeurbediening</h2>
      {!running && (
        <p className="hint">
          Stuur de oefening aan: bepaal de analyse-uitkomst en beheer de
          compressie-/ventilatiefase.
        </p>
      )}

      {!running && (
        <div className="field" style={{ marginTop: '.8rem' }}>
          <label htmlFor="language-select">Taal van de gesproken instructies</label>
          <select
            id="language-select"
            value={language}
            onChange={e => onLanguageChange(e.target.value)}
            style={{ maxWidth: '20rem' }}
          >
            <option>Nederlands</option>
            <option>Duits</option>
          </select>
        </div>
      )}

      {!running && (
        <div className="field" style={{ marginTop: '.8rem' }}>
          <label htmlFor="metronome-select">Metronoom (compressies : ventilaties)</label>
          <select
            id="metronome-select"
            value={metronome}
            onChange={e => onMetronomeChange(e.target.value)}
            style={{ maxWidth: '20rem' }}
          >
            <option value="Uit">Uit</option>
            <option value="30:2">30:2 — volwassenen</option>
            <option value="15:1">15:1</option>
            <option value="10:1">10:1</option>
          </select>
          <p className="hint" style={{ marginBottom: 0 }}>
            Tijdens de reanimatiefase tikt de metronoom de compressies (110/min)
            en begeleidt de ventilaties.
          </p>
        </div>
      )}

      {!running && !currentStep && (
        <div className="empty">
          <p>{connected
            ? 'Kies Start oefening om te beginnen.'
            : 'Kies Start oefening (simulatie) om zonder hardware te oefenen, of verbind eerst een apparaat.'}</p>
          <Btn variant="warning" onClick={onStart}>
            {connected ? 'Start oefening' : 'Start oefening (simulatie)'}
          </Btn>
        </div>
      )}

      {currentStep && (
        <>
          <div className="card-heading" style={{ marginTop: '.8rem' }}>
            <div>
              <h3>{currentStep.label}</h3>
              <p className="muted">{currentStep.instruction}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
              {badge && <Badge color={badge.color}>{badge.label}</Badge>}
              {timeLeft != null && (
                <div className={`timer${timeLeft <= 10 ? ' urgent' : ''}`}>{formatTime(timeLeft)}</div>
              )}
            </div>
          </div>

          {waitingBranch && currentStep.choices && (
            <>
              <Divider />
              <h3 style={{ marginBottom: '.5rem' }}>Maak een keuze</h3>
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

          {running && (
            <>
              <Divider />
              <h3 style={{ marginBottom: '.5rem' }}>Bediening</h3>
              <div className="button-row">
                {isTimedPhase && (
                  <Btn variant="warning" onClick={onSkipPhase}>
                    Fase inkorten
                  </Btn>
                )}
                <Btn variant="danger" onClick={onStop}>Oefening beëindigen</Btn>
              </div>
              <p className="hint">
                {isTimedPhase
                  ? '"Fase inkorten" springt direct naar de volgende stap in het scenario.'
                  : 'De fase loopt automatisch af of wacht op een knop van de deelnemer.'}
              </p>
            </>
          )}
        </>
      )}
    </Card>
  );
}
