import React, { useState } from 'react';
import { Card, SectionLabel, Btn, Divider } from './UI';
import { AUDIO_FILES, LANGUAGES } from '../scenario/default';

const STEP_TYPES = ['button', 'timed', 'branch', 'end'];
const BTN_KEYS   = ['shock', 'on_off', 'info', 'card_slot', 'pads_inserted'];
const LED_KEYS   = ['shock', 'on_off', 'info', 'hands_off', 'low_belly', 'breast'];

function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', width: 110, flexShrink: 0, paddingTop: 6 }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function StepEditor({ step, onChange, onDelete, allStepIds }) {
  const audioKeys = Object.keys(AUDIO_FILES['Nederlands']);

  function set(field, value) {
    onChange({ ...step, [field]: value });
  }
  function setLed(key, val) {
    onChange({ ...step, leds: { ...step.leds, [key]: val } });
  }
  function setChoice(i, field, val) {
    const choices = [...(step.choices || [])];
    choices[i] = { ...choices[i], [field]: val };
    onChange({ ...step, choices });
  }
  function addChoice() {
    onChange({ ...step, choices: [...(step.choices || []), { label: '', next: '' }] });
  }
  function removeChoice(i) {
    const choices = [...(step.choices || [])];
    choices.splice(i, 1);
    onChange({ ...step, choices });
  }

  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: '10px 12px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input value={step.id} onChange={e => set('id', e.target.value)}
          placeholder="step-id" style={{ flex: 1, fontSize: 12, fontFamily: 'var(--mono)' }} />
        <select value={step.type} onChange={e => set('type', e.target.value)} style={{ fontSize: 12 }}>
          {STEP_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <Btn small variant="danger" onClick={onDelete}>✕</Btn>
      </div>

      <FieldRow label="Label">
        <input value={step.label || ''} onChange={e => set('label', e.target.value)}
          style={{ width: '100%' }} placeholder="Step label" />
      </FieldRow>

      <FieldRow label="Instruction">
        <textarea value={step.instruction || ''} onChange={e => set('instruction', e.target.value)}
          rows={2} style={{ width: '100%', resize: 'vertical', fontSize: 12 }} />
      </FieldRow>

      <FieldRow label="Audio">
        <select value={step.audioKey || ''} onChange={e => set('audioKey', e.target.value || null)}
          style={{ width: '100%', fontSize: 12 }}>
          <option value="">— none —</option>
          {audioKeys.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </FieldRow>

      <FieldRow label="LEDs">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {LED_KEYS.map(k => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!(step.leds?.[k])}
                onChange={e => setLed(k, e.target.checked)} />
              {k}
            </label>
          ))}
        </div>
      </FieldRow>

      {step.type === 'button' && (
        <>
          <FieldRow label="Expect button">
            <select value={step.expect_button || ''} onChange={e => set('expect_button', e.target.value)}
              style={{ fontSize: 12 }}>
              <option value="">— none —</option>
              {BTN_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Timeout (s)">
            <input type="number" value={step.timeout_seconds || ''} min={0}
              onChange={e => set('timeout_seconds', Number(e.target.value))}
              style={{ width: 80 }} />
          </FieldRow>
          <FieldRow label="On correct">
            <select value={step.on_correct || ''} onChange={e => set('on_correct', e.target.value)}
              style={{ fontSize: 12, width: '100%' }}>
              <option value="">— none —</option>
              {allStepIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="On timeout">
            <select value={step.on_timeout || ''} onChange={e => set('on_timeout', e.target.value)}
              style={{ fontSize: 12, width: '100%' }}>
              <option value="">— none —</option>
              {allStepIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </FieldRow>
        </>
      )}

      {step.type === 'timed' && (
        <>
          <FieldRow label="Duration (s)">
            <input type="number" value={step.duration_seconds || ''} min={1}
              onChange={e => set('duration_seconds', Number(e.target.value))}
              style={{ width: 80 }} />
          </FieldRow>
          <FieldRow label="On complete">
            <select value={step.on_complete || ''} onChange={e => set('on_complete', e.target.value)}
              style={{ fontSize: 12, width: '100%' }}>
              <option value="">— none —</option>
              {allStepIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </FieldRow>
        </>
      )}

      {step.type === 'branch' && (
        <>
          <FieldRow label="Choices">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(step.choices || []).map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={c.label} onChange={e => setChoice(i, 'label', e.target.value)}
                    placeholder="Choice label" style={{ flex: 1, fontSize: 12 }} />
                  <select value={c.next || ''} onChange={e => setChoice(i, 'next', e.target.value)}
                    style={{ fontSize: 12 }}>
                    <option value="">— next —</option>
                    {allStepIds.map(id => <option key={id} value={id}>{id}</option>)}
                  </select>
                  <Btn small variant="ghost" onClick={() => removeChoice(i)}>✕</Btn>
                </div>
              ))}
              <Btn small variant="ghost" onClick={addChoice}>+ Add choice</Btn>
            </div>
          </FieldRow>
        </>
      )}
    </div>
  );
}

export function ScenarioEditor({ steps, onStepsChange, disabled }) {
  const [open, setOpen] = useState(false);

  const allStepIds = steps.map(s => s.id);

  function updateStep(i, updated) {
    const next = [...steps];
    next[i] = updated;
    onStepsChange(next);
  }
  function deleteStep(i) {
    const next = [...steps];
    next.splice(i, 1);
    onStepsChange(next);
  }
  function addStep() {
    onStepsChange([...steps, {
      id: `step-${Date.now()}`, label: 'New step', instruction: '',
      type: 'button', leds: {}, audioKey: null,
      expect_button: 'on_off', timeout_seconds: 30,
      on_correct: '', on_timeout: '',
    }]);
  }
  function moveStep(i, dir) {
    const next = [...steps];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onStepsChange(next);
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(steps, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scenario.json';
    a.click();
  }
  function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try { onStepsChange(JSON.parse(ev.target.result)); } catch(_) { alert('Invalid JSON'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SectionLabel style={{ marginBottom: 0, flex: 1 }}>Scenario editor</SectionLabel>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{steps.length} steps</span>
        <Btn small variant="ghost" onClick={exportJson}>Export JSON</Btn>
        <label style={{ cursor: 'pointer' }}>
          <Btn small variant="ghost" disabled={false} style={{ pointerEvents: 'none' }}>Import JSON</Btn>
          <input type="file" accept=".json" onChange={importJson} style={{ display: 'none' }} />
        </label>
        <Btn small variant="ghost" onClick={() => setOpen(o => !o)}>
          {open ? 'Hide ▴' : 'Edit ▾'}
        </Btn>
      </div>

      {open && (
        <div style={{ marginTop: 12 }}>
          {disabled && (
            <div style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 8 }}>
              Stop the session to edit the scenario.
            </div>
          )}
          {!disabled && steps.map((step, i) => (
            <div key={step.id + i} style={{ display: 'flex', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 10 }}>
                <Btn small variant="ghost" onClick={() => moveStep(i, -1)} disabled={i === 0}>▴</Btn>
                <Btn small variant="ghost" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>▾</Btn>
              </div>
              <div style={{ flex: 1 }}>
                <StepEditor
                  step={step}
                  onChange={updated => updateStep(i, updated)}
                  onDelete={() => deleteStep(i)}
                  allStepIds={allStepIds}
                />
              </div>
            </div>
          ))}
          {!disabled && (
            <Btn variant="ghost" onClick={addStep} style={{ width: '100%', marginTop: 4 }}>
              + Add step
            </Btn>
          )}
        </div>
      )}
    </Card>
  );
}
