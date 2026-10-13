import React, { useState, useCallback, useEffect } from 'react';
import { Card, Btn } from './UI';

// Device names that look like the AED trainer's Bluetooth audio endpoint.
const AED_PATTERN = /aed|oefen|simulator|trainer|cpr/i;

export function AudioConnectionCard({ onSinkChange, onTestAudio }) {
  const [devices, setDevices] = useState([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('idle'); // idle | ready | error

  const supported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.enumerateDevices
    && typeof HTMLMediaElement !== 'undefined'
    && 'setSinkId' in HTMLMediaElement.prototype;

  const enumerate = useCallback(async () => {
    try {
      let outputs = (await navigator.mediaDevices.enumerateDevices())
        .filter(d => d.kind === 'audiooutput');
      // Device labels are only exposed after an audio permission grant.
      if (outputs.length > 0 && !outputs.some(d => d.label)) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop());
          outputs = (await navigator.mediaDevices.enumerateDevices())
            .filter(d => d.kind === 'audiooutput');
        } catch (_) {
          // No permission: labels stay empty, manual selection still possible.
        }
      }
      setDevices(outputs);
      setStatus('ready');
    } catch (_) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (!supported) return;
    enumerate();
    navigator.mediaDevices.addEventListener?.('devicechange', enumerate);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', enumerate);
  }, [supported, enumerate]);

  // Auto-select an output that looks like the AED trainer.
  useEffect(() => {
    if (selected || !supported) return;
    const match = devices.find(d => AED_PATTERN.test(d.label));
    if (match) {
      setSelected(match.deviceId);
      onSinkChange(match.deviceId);
    }
  }, [devices, selected, supported, onSinkChange]);

  // If the chosen output disappears (Bluetooth audio disconnected at the OS),
  // fall back to the system default; auto-select picks it up again on return.
  useEffect(() => {
    if (status !== 'ready' || !selected) return;
    if (!devices.some(d => d.deviceId === selected)) {
      setSelected('');
      onSinkChange(null);
    }
  }, [devices, selected, status, onSinkChange]);

  async function handleSearch() {
    await enumerate();
  }

  function handleChange(e) {
    const id = e.target.value;
    setSelected(id);
    onSinkChange(id || null);
  }

  const aedMatch = devices.find(d => AED_PATTERN.test(d.label));
  const audioState = status !== 'ready'
    ? 'Onbekend'
    : aedMatch
      ? 'AED aangesloten'
      : 'Niet aangesloten';

  return (
    <Card>
      <div className="card-heading">
        <div>
          <h2>Audio via Bluetooth</h2>
          <p className="hint">
            De gesproken instructies gaan via de Bluetooth-audioverbinding naar de oefen-AED.
            Koppel de oefen-AED als luidspreker in de systeeminstellingen van dit apparaat
            en kies hem daarna hieronder.
          </p>
        </div>
        <span className={`badge ${status === 'ready' ? (aedMatch ? 'success' : 'warning') : ''}`}>
          {audioState}
        </span>
      </div>
      <div className="button-row" style={{ marginTop: '.8rem' }}>
        <Btn variant="secondary" onClick={handleSearch} disabled={!supported}>
          Audio-apparaten zoeken
        </Btn>
        <Btn variant="secondary" onClick={onTestAudio} disabled={!supported}>
          Testaudio afspelen
        </Btn>
      </div>
      <div className="field">
        <label htmlFor="audio-output">Geluidsuitgang voor de instructies</label>
        <select
          id="audio-output"
          value={selected}
          onChange={handleChange}
          disabled={!supported || devices.length === 0}
        >
          <option value="">Dit apparaat (standaard)</option>
          {devices.map(d => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || 'Apparaat'}
            </option>
          ))}
        </select>
      </div>

      {!supported && (
        <div className="message error" role="status">
          Deze browser ondersteunt het kiezen van een geluidsuitgang niet.
          Gebruik Chrome of Edge, of laat de audio op dit apparaat afspelen.
        </div>
      )}
      {status === 'error' && (
        <div className="message error" role="status">
          Audio-apparaten konden niet worden opgevraagd. Controleer de browserrechten.
        </div>
      )}
      {supported && aedMatch && (
        <div className={`message${selected === aedMatch.deviceId ? ' success' : ''}`} role="status">
          {selected === aedMatch.deviceId
            ? `Audio gericht naar de oefen-AED (${aedMatch.label}).`
            : `Mogelijke AED gevonden: ${aedMatch.label}. Kies hem als geluidsuitgang.`}
        </div>
      )}
      {supported && !aedMatch && status === 'ready' && devices.length > 0 && (
        <div className="message" role="status">
          Geen AED-uitgang herkend. Koppel de oefen-AED in de systeeminstellingen en
          zoek opnieuw, of kies handmatig een geluidsuitgang.
        </div>
      )}
    </Card>
  );
}
