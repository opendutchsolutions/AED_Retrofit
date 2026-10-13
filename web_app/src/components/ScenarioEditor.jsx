// SPDX-License-Identifier: MIT
// Copyright (c) 2024 Victor Hogeweij
import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { Card, Btn } from './UI';
import { AUDIO_FILES, LANGUAGES } from '../scenario/default';

const STEP_TYPES = ['button', 'timed', 'branch', 'end'];
const BTN_KEYS   = ['shock', 'on_off', 'info', 'card_slot', 'pads_inserted'];
const LED_KEYS   = ['shock', 'on_off', 'info', 'hands_off', 'low_belly', 'breast', 'buzzer'];
const BUILTIN_AUDIO_KEYS = Object.keys(AUDIO_FILES['Nederlands']);

function FieldRow({ label, children }) {
  return (
    <div className="field-row">
      <div className="field-label">{label}</div>
      <div>{children}</div>
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
    <div className="step-editor">
      <div className="inline" style={{ marginBottom: '.6rem' }}>
        <input value={step.id} onChange={e => set('id', e.target.value)}
          placeholder="stap-id" style={{ flex: 1 }} aria-label="Stap-id" />
        <select value={step.type} onChange={e => set('type', e.target.value)} aria-label="Type stap">
          {STEP_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <Btn small variant="danger" onClick={onDelete} title="Stap verwijderen">✕</Btn>
      </div>

      <FieldRow label="Label">
        <input value={step.label || ''} onChange={e => set('label', e.target.value)}
          placeholder="Label van de stap" aria-label="Label" />
      </FieldRow>

      <FieldRow label="Instructie">
        <textarea value={step.instruction || ''} onChange={e => set('instruction', e.target.value)}
          rows={2} aria-label="Instructie" />
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
            aria-label="Audio van de stap"
          >
            <option value="">— geen —</option>
            <optgroup label="Ingebouwd">
              {BUILTIN_AUDIO_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </optgroup>
            {customAudioKeys.length > 0 && (
              <optgroup label="Eigen audio">
                {customAudioKeys.map(k => <option key={k} value={k}>{k}</option>)}
              </optgroup>
            )}
            <option value="__upload__">+ Eigen audiobestand toevoegen…</option>
          </select>
          {awaitingUpload && (
            <>
              <Btn small variant="secondary" onClick={() => fileInputRef.current?.click()}>
                Bestand kiezen…
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

      <FieldRow label="LED's / zoemer">
        <div className="chip-grid" style={{ marginBottom: 0 }}>
          {LED_KEYS.map(k => {
            const on = !!(step.leds?.[k]);
            return (
              <label key={k} className="radio" style={{ fontWeight: 'normal', display: 'inline-flex', alignItems: 'center', gap: '.4rem', margin: '.25rem .5rem .25rem 0' }}>
                <input type="checkbox" checked={on} style={{ width: '1.15rem', minHeight: 'auto', height: '1.15rem' }}
                  onChange={e => setLed(k, e.target.checked)} />
                {k}
              </label>
            );
          })}
        </div>
      </FieldRow>

      {step.leds?.buzzer && (
        <FieldRow label="Zoemer (ms)">
          <input
            type="number" min={0} step={100}
            value={step.buzzer_duration_ms || ''}
            onChange={e => set('buzzer_duration_ms', Number(e.target.value) || null)}
            placeholder="0 = blijft aan tijdens de stap"
            style={{ maxWidth: 200 }}
          />
        </FieldRow>
      )}

      {step.type === 'button' && (
        <>
          <FieldRow label="Verwachte knop">
            <select value={step.expect_button || ''} onChange={e => set('expect_button', e.target.value)}>
              <option value="">— geen —</option>
              {BTN_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Time-out (s)">
            <input type="number" value={step.timeout_seconds || ''} min={0}
              onChange={e => set('timeout_seconds', Number(e.target.value))}
              style={{ maxWidth: 100 }} />
          </FieldRow>
          <FieldRow label="Bij correct">
            <select value={step.on_correct || ''} onChange={e => set('on_correct', e.target.value)}>
              <option value="">— geen —</option>
              {allStepIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </FieldRow>
          <FieldRow label="Bij time-out">
            <select value={step.on_timeout || ''} onChange={e => set('on_timeout', e.target.value)}>
              <option value="">— geen —</option>
              {allStepIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </FieldRow>
        </>
      )}

      {step.type === 'timed' && (
        <>
          <FieldRow label="Duur (s)">
            <input type="number" value={step.duration_seconds || ''} min={1}
              onChange={e => set('duration_seconds', Number(e.target.value))}
              style={{ maxWidth: 100 }} />
          </FieldRow>
          <FieldRow label="Na afloop">
            <select value={step.on_complete || ''} onChange={e => set('on_complete', e.target.value)}>
              <option value="">— geen —</option>
              {allStepIds.map(id => <option key={id} value={id}>{id}</option>)}
            </select>
          </FieldRow>
        </>
      )}

      {step.type === 'branch' && (
        <FieldRow label="Keuzes">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(step.choices || []).map((c, i) => (
              <div key={i} className="inline">
                <input value={c.label} onChange={e => setChoice(i, 'label', e.target.value)}
                  placeholder="Label van de keuze" style={{ flex: 1 }} aria-label={`Label keuze ${i + 1}`} />
                <select value={c.next || ''} onChange={e => setChoice(i, 'next', e.target.value)}
                  aria-label={`Volgende stap keuze ${i + 1}`}>
                  <option value="">— volgende —</option>
                  {allStepIds.map(id => <option key={id} value={id}>{id}</option>)}
                </select>
                <Btn small variant="ghost" onClick={() => removeChoice(i)}>✕</Btn>
              </div>
            ))}
            <Btn small variant="secondary" onClick={addChoice}>+ Keuze toevoegen</Btn>
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
      <h3 style={{ marginBottom: '.5rem' }}>Eigen audio</h3>
      {entries.map(([key, { name, url }]) => (
        <div key={key} className="audio-entry">
          <code>{key}</code>
          <span className="muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.9rem' }}>
            {name}
          </span>
          <button onClick={() => new Audio(url).play()} title="Voorbeluisteren"
            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '1rem' }}>▶</button>
          <Btn small variant="danger" onClick={() => onRemove(key)} title="Verwijderen">✕</Btn>
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
      id: `step-${Date.now()}`, label: 'Nieuwe stap', instruction: '',
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
      if (!scenarioEntry) { alert('Ongeldig scenario-ZIP: scenario.json ontbreekt'); return; }

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
      alert(`Importeren van ZIP mislukt: ${err.message}`);
    }
  }

  const hasCustomAudio = customAudioKeys.length > 0;

  return (
    <Card>
      <div className="card-heading">
        <div>
          <h2>Scenario-editor</h2>
          <p className="muted">{steps.length} stappen</p>
        </div>
        <div className="button-row">
          <Btn small variant="secondary" onClick={exportZip}>
            Exporteren{hasCustomAudio ? ` (${customAudioKeys.length} audio)` : ''}
          </Btn>
          <label style={{ cursor: 'pointer' }}>
            <Btn small variant="secondary" style={{ pointerEvents: 'none' }}>Importeren</Btn>
            <input type="file" accept=".zip" onChange={importZip} style={{ display: 'none' }} />
          </label>
          <Btn small variant="secondary" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            {open ? 'Inklappen' : 'Bewerken'}
          </Btn>
        </div>
      </div>

      {open && (
        <div className="editor">
          {disabled && (
            <p className="message error" style={{ marginTop: 0 }}>
              Stop de oefening om het scenario aan te passen.
            </p>
          )}

          <AudioBankSection
            bank={audioBank || {}}
            onRemove={onRemoveAudio}
          />

          {!disabled && steps.map((step, i) => (
            <div key={step.id + i} className="step-row" style={{ marginBottom: '.6rem' }}>
              <div className="move-buttons">
                <Btn small variant="secondary" onClick={() => moveStep(i, -1)} disabled={i === 0} title="Omhoog">▴</Btn>
                <Btn small variant="secondary" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} title="Omlaag">▾</Btn>
              </div>
              <div>
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
            <Btn variant="secondary" onClick={addStep} style={{ width: '100%' }}>
              + Stap toevoegen
            </Btn>
          )}
        </div>
      )}
    </Card>
  );
}
