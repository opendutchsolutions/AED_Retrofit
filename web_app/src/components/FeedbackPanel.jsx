import React from 'react';
import { Card } from './UI';
import {
  FEEDBACK_GROUPS, FEEDBACK_QUESTIONS, classifyAnswer, questionsForStep, summarizeFeedback,
} from '../feedback/model';

function answerLabel(question, value) {
  return question.options === 'score' && /^[0-5]$/.test(value) ? `${value} van 5` : value;
}

function Question({ question, value, onAnswer, prefix }) {
  const options = question.options === 'score'
    ? ['0', '1', '2', '3', '4', '5', 'Niet beoordeeld', 'Niet van toepassing']
    : question.options;
  return (
    <fieldset className="feedback-question">
      <legend>{question.label}</legend>
      <div className={`feedback-choices${question.options === 'score' ? ' score-choices' : ''}`}>
        {options.map(option => (
          <label key={option} className={`feedback-choice ${classifyAnswer(question, option)}`}>
            <input
              type="radio"
              name={`${prefix}-${question.id}`}
              value={option}
              checked={value === option}
              onChange={() => onAnswer(question.id, option)}
              aria-label={question.options === 'score' && option === '5' ? '5 – Uitstekend'
                : question.options === 'score' && option === '0' ? '0 – Onveilig / niet uitgevoerd'
                : question.options === 'score' && option === '3' ? '3 – Voldoende' : option}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
      {value && <p className="feedback-answer">Opgeslagen: {answerLabel(question, value)}</p>}
    </fieldset>
  );
}

export function FeedbackPanel({ step, answers, note, onChange, onBack, backLabel = 'Opslaan en terug naar training', saveStatus = 'Alleen in deze browser opgeslagen' }) {
  const counts = summarizeFeedback(answers);
  const quick = questionsForStep(step?.id)
    .map(id => FEEDBACK_QUESTIONS.find(question => question.id === id))
    .filter(Boolean);
  const answer = (id, value) => onChange({ ...answers, [id]: value }, note);
  return (
    <div className="feedback-layout">
      <div className="feedback-heading">
        <div>
          <p className="eyebrow">Optionele beoordeling</p>
          <h1 tabIndex={-1}>Feedback vastleggen</h1>
          <p className="muted">Leg vast wat goed gaat en wat beter kan. Geen enkele vraag is verplicht.</p>
        </div>
        <p className="hint" role="status">{saveStatus}</p>
      </div>
      <div className="feedback-overview" aria-label="Voortgang feedback">
        <div><strong>{counts.answered}</strong><span>{counts.answered === 1 ? 'onderdeel beoordeeld' : 'onderdelen beoordeeld'}</span></div>
        <div><strong>{counts.strengths}</strong><span>{counts.strengths === 1 ? 'sterk punt' : 'sterke punten'}</span></div>
        <div><strong>{counts.improvements}</strong><span>{counts.improvements === 1 ? 'verbeterpunt' : 'verbeterpunten'}</span></div>
      </div>
      <Card className="feedback-phase">
        <p>Huidige trainingsfase</p>
        <h2>{step?.label || 'Nog geen actieve trainingsfase'}</h2>
        <p className="muted">{quick.length ? 'De vragen hieronder passen bij deze fase.' : 'Kies hieronder een onderdeel om te beoordelen.'}</p>
      </Card>
      {quick.length > 0 && (
        <section aria-label="Vragen bij deze fase" className="feedback-quick">
          {quick.map(question => <Question key={question.id} question={question} value={answers[question.id]} onAnswer={answer} prefix="quick" />)}
        </section>
      )}
      <section aria-label="Alle onderdelen">
        <details className="feedback-all">
          <summary>Alle feedbackonderdelen</summary>
          {FEEDBACK_GROUPS.map(group => (
            <details key={group.title} className="feedback-category">
              <summary>{group.title} — {group.questions.filter(question => answers[question.id]).length} van {group.questions.length} beoordeeld</summary>
              {group.questions.map(question => (
                <Question key={question.id} question={question} value={answers[question.id]} onAnswer={answer} prefix="all" />
              ))}
            </details>
          ))}
        </details>
      </section>
      <Card>
        <label htmlFor="feedback-note">Aanvullende notitie (optioneel)</label>
        <p className="hint">Noteer alleen wat nodig is voor de nabespreking. Vermijd persoonsgegevens.</p>
        <textarea id="feedback-note" maxLength={500} rows={4} value={note} onChange={event => onChange(answers, event.target.value)} />
        <p className="hint">{note.length} van 500 tekens</p>
      </Card>
      <div className="feedback-actions">
        <p>{counts.answered ? `${counts.answered} beoordeeld · ${counts.strengths} sterke punten · ${counts.improvements} verbeterpunten` : 'Geen feedback vastgelegd'}</p>
        <div className="button-row">
          <button type="button" className="button secondary" onClick={() => {
            if (window.confirm('Alle feedback en notitie wissen?')) onChange({}, '');
          }}>Feedback wissen</button>
          <button type="button" className="button primary" onClick={onBack}>{backLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function FeedbackSummary({ answers, note, onEdit, onExport, onPrint }) {
  const groups = [
    { title: 'Sterke punten', kind: 'good' },
    { title: 'Verbeterpunten', kind: 'attention' },
    { title: 'Neutraal of niet beoordeeld', kind: 'neutral' },
  ];
  const entries = FEEDBACK_QUESTIONS.filter(question => answers[question.id]);
  return (
    <Card className="feedback-result">
      <h2>Feedback en nabespreking</h2>
      {!entries.length && !note && <p>Er is nog geen feedback vastgelegd.</p>}
      {groups.map(group => {
        const selected = entries.filter(question => classifyAnswer(question, answers[question.id]) === group.kind);
        return selected.length > 0 && (
          <div key={group.kind}>
            <h3>{group.title}</h3>
            <ul>{selected.map(question => <li key={question.id}>{question.label}: {answerLabel(question, answers[question.id])}</li>)}</ul>
          </div>
        );
      })}
      {note && <div><h3>Notitie</h3><p>{note}</p></div>}
      <div className="button-row no-print">
        <button className="button secondary" type="button" onClick={onEdit}>Feedback aanvullen</button>
        <button className="button secondary" type="button" onClick={onPrint}>Afdrukken</button>
        <button className="button secondary" type="button" onClick={onExport}>JSON exporteren</button>
      </div>
    </Card>
  );
}
