// SPDX-License-Identifier: MIT
// Copyright (c) 2024 Victor Hogeweij
import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { Card, SectionLabel, Btn, Divider } from './UI';
import { AUDIO_FILES, LANGUAGES } from '../scenario/default';

const STEP_TYPES = ['button', 'timed', 'branch', 'end'];
const BTN_KEYS   = ['shock', 'on_off', 'info', 'card_slot', 'pads_inserted'];
const LED_KEYS   = ['shock', 'on_off', 'info', 'hands_off', 'low_belly', 'breast', 'buzzer'];
const BUILTIN_AUDIO_KEYS = Object.keys(AUDIO_FILES['Nederlands']);

function FieldRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text3)', width: 110, flexShrink: 0, paddingTop: 6 }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function StepEditor({ step, onChange, onDelete, allStepIds, customAudioKeys, onAddAudio }) {
  const [awaitingUpload, setAwaitingUpload] = useState(false);
  const fileInputRef = useRef(null);

  function set(field, value) { onChange({ ...step, [field]: value }); }
  function setLed(key, val)  { onChange({ ...step, leds: { ...step.leds, [key]: val } }); }
  function setChoice(i, field, val) {
    const choices = [...(step.choices || [])];
    choices[i] = { ...choices[i], [field]: val };
    onChange({ ...step, choices });
  }
  function addChoice()    { onChange({ ...step, choices: [...(step.choices || []), { label: '', next: '' }] }); }
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select
            value={awaitingUpload ? '__upload__' : (step.audioKey || '')}
            onChange={e => {
              if (e.target.value === '__upload__') {
                setAwaitingUpload(true);
              } else {
                setAwaitingUpload(false);
                set('audioKey', e.target.value || null);
              }
            }}
            style={{ width: '100%', fontSize: 12 }}
          >
            <option value="">— none —</option>
            <optgroup label="Built-in">
              {BUILTIN_AUDIO_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </optgroup>
            {customAudioKeys.length > 0 && (
              <optgroup label="Custom">
                {customAudioKeys.map(k => <option key={k} value={k}>{k}</option>)}
              </optgroup>
            )}
            <option value="__upload__">+ Add own audio file…</option>
          </select>
          {awaitingUpload && (
            <>
              <Btn small variant="ghost" onClick={() => fileInputRef.current?.click()}>
                Choose file…
              </Btn>
              <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  const key = file.name.replace(/\.[^.]+$/, '').replace(/[\s-]+/g, '_');
                  onAddAudio(key, file);
                  set('audioKey', key);
                  setAwaitingUpload(false);
                  e.target.value = '';
                }} />
            </>
          )}
        </div>
      </FieldRow>

      <FieldRow label="LEDs / Buzzer">
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

      {step.leds?.buzzer && (
        <FieldRow label="Buzzer (ms)">
          <input
            type="number" min={0} step={100}
            value={step.buzzer_duration_ms || ''}
            onChange={e => set('buzzer_duration_ms', Number(e.target.value) || null)}
            placeholder="0 = stays on for step"
            style={{ width: 160 }}
          />
        </FieldRow>
      )}

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
      )}
    </div>
  );
}

function AudioBankSection({ bank, onRemove }) {
  const entries = Object.entries(bank);
  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, letterSpacing: '0.06em',
        textTransform: 'uppercase', marginBottom: 8 }}>
        Custom audio
      </div>
      {entries.map(([key, { name, url }]) => (
        <div key={key} style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
          background: 'var(--bg3)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '4px 8px',
        }}>
          <code style={{ fontSize: 11, color: 'var(--accent)', flex: '0 0 auto', minWidth: 80 }}>{key}</code>
          <span style={{ fontSize: 11, color: 'var(--text3)', flex: 1, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <button onClick={() => new Audio(url).play()} title="Preview"
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text2)', fontSize: 13, padding: '0 2px' }}>▶</button>
          <Btn small variant="danger" onClick={() => onRemove(key)}>✕</Btn>
        </div>
      ))}
    </div>
  );
}

export function ScenarioEditor({
  steps, onStepsChange, disabled,
  language,
  audioBank, onAddAudio, onRemoveAudio,
  getExportEntries, onImportAudio,
}) {
  const [open, setOpen] = useState(false);

  const allStepIds      = steps.map(s => s.id);
  const customAudioKeys = Object.keys(audioBank || {});

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

  async function exportZip() {
    const customEntries = getExportEntries ? getExportEntries() : [];
    const customByKey   = Object.fromEntries(customEntries.map(e => [e.key, e]));
    const audioMap      = AUDIO_FILES[language] || AUDIO_FILES['Nederlands'];

    const zip        = new JSZip();
    const manifest   = {};   // key → zipPath, written into scenario.json

    // 1. Custom-uploaded audio from the bank (already ArrayBuffers)
    for (const { key, name, data } of customEntries) {
      const ext     = name.includes('.') ? name.split('.').pop() : 'wav';
      const zipPath = `audio/${key}.${ext}`;
      zip.file(zipPath, data);
      manifest[key] = zipPath;
    }

    // 2. Built-in audio for every audioKey used in the steps that isn't already
    //    overridden by a custom file — fetch from the public folder.
    const usedKeys = [...new Set(steps.map(s => s.audioKey).filter(Boolean))];
    await Promise.all(usedKeys.map(async (key) => {
      if (customByKey[key]) return;              // already handled above
      const src = audioMap[key];
      if (!src) return;
      try {
        const resp = await fetch(src);
        if (!resp.ok) return;
        const data    = await resp.arrayBuffer();
        const ext     = src.split('.').pop();
        const zipPath = `audio/${key}.${ext}`;
        zip.file(zipPath, data);
        manifest[key] = zipPath;
      } catch (_) {}
    }));

    zip.file('scenario.json', JSON.stringify({ version: 1, steps, customAudio: manifest }, null, 2));

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = 'scenario.zip';
    a.click();
  }

  async function importZip(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const zip = await JSZip.loadAsync(file);
      const scenarioEntry = zip.file('scenario.json');
      if (!scenarioEntry) { alert('Invalid scenario ZIP: missing scenario.json'); return; }

      const json = JSON.parse(await scenarioEntry.async('text'));
      const { steps: importedSteps, customAudio = {} } = json;

      if (importedSteps) onStepsChange(importedSteps);

      if (onImportAudio && Object.keys(customAudio).length > 0) {
        const audioEntries = [];
        for (const [key, zipPath] of Object.entries(customAudio)) {
          const zipEntry = zip.file(zipPath);
          if (!zipEntry) continue;
          const data = await zipEntry.async('arraybuffer');
          const name = zipPath.split('/').pop();
          audioEntries.push({ key, name, data });   // pass ArrayBuffer directly
        }
        onImportAudio(audioEntries);
      }
    } catch (err) {
      alert(`Failed to import ZIP: ${err.message}`);
    }
  }

  const hasCustomAudio = customAudioKeys.length > 0;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SectionLabel style={{ marginBottom: 0, flex: 1 }}>Scenario editor</SectionLabel>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{steps.length} steps</span>
        <Btn small variant="ghost" onClick={exportZip}>
          Export{hasCustomAudio ? ` (${customAudioKeys.length} audio)` : ''}
        </Btn>
        <label style={{ cursor: 'pointer' }}>
          <Btn small variant="ghost" style={{ pointerEvents: 'none' }}>Import</Btn>
          <input type="file" accept=".zip" onChange={importZip} style={{ display: 'none' }} />
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

          <AudioBankSection
            bank={audioBank || {}}
            onRemove={onRemoveAudio}
          />

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
                  customAudioKeys={customAudioKeys}
                  onAddAudio={onAddAudio}
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
