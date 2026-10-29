import { FEEDBACK_QUESTIONS } from '../feedback/model';

const PROBE_KEY = '__aed_system_storage_probe__';

export function probeStorage(storage) {
  try {
    storage.setItem(PROBE_KEY, 'ok');
    return storage.getItem(PROBE_KEY) === 'ok';
  } catch {
    return false;
  } finally {
    try { storage?.removeItem(PROBE_KEY); } catch { /* storage blocked */ }
  }
}

export function detectCapabilities({ protocol, storageAvailable, indexedDBAvailable, bluetoothAvailable, online, touch, reducedMotion, forcedColors }) {
  return [
    { label: 'Lokaal bestand geopend', value: protocol === 'file:' ? 'Ja' : 'Nee', kind: protocol === 'file:' ? 'limited' : 'good' },
    { label: 'Lokale opslag', value: storageAvailable ? 'Beschikbaar' : 'Niet beschikbaar', kind: storageAvailable ? 'good' : 'bad' },
    { label: 'IndexedDB', value: indexedDBAvailable ? 'Beschikbaar' : 'Niet beschikbaar', kind: indexedDBAvailable ? 'good' : 'limited' },
    { label: 'Web Bluetooth', value: bluetoothAvailable ? 'Beschikbaar' : 'Niet beschikbaar', kind: bluetoothAvailable ? 'good' : 'limited' },
    { label: 'Internetverbinding', value: online ? 'Beschikbaar' : 'Offline', kind: online ? 'good' : 'limited' },
    { label: 'Touchbediening', value: touch ? 'Beschikbaar' : 'Niet gedetecteerd', kind: 'neutral' },
    { label: 'Reduced motion', value: reducedMotion ? 'Actief' : 'Niet actief', kind: 'neutral' },
    { label: 'Forced colors', value: forcedColors ? 'Actief' : 'Niet actief', kind: 'neutral' },
  ];
}

export function inspectBrowser() {
  let storageAvailable = false;
  try { storageAvailable = probeStorage(window.localStorage); } catch { /* blocked storage getter */ }
  return detectCapabilities({
    protocol: window.location.protocol,
    storageAvailable,
    indexedDBAvailable: 'indexedDB' in window,
    bluetoothAvailable: 'bluetooth' in navigator,
    online: navigator.onLine,
    touch: navigator.maxTouchPoints > 0,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
    forcedColors: window.matchMedia?.('(forced-colors: active)').matches || false,
  });
}

export function parseFeedbackBackup(text) {
  const data = JSON.parse(text);
  const source = data?.feedback || data;
  if (!source || typeof source !== 'object' || !source.answers ||
      typeof source.answers !== 'object' || Array.isArray(source.answers) ||
      (source.note !== undefined && typeof source.note !== 'string')) {
    throw new Error('Geen geldige feedback-reservekopie');
  }
  const questions = Object.fromEntries(FEEDBACK_QUESTIONS.map(question => [question.id, question]));
  const answers = {};
  for (const [id, value] of Object.entries(source.answers)) {
    const question = questions[id];
    const options = question?.options === 'score'
      ? ['0', '1', '2', '3', '4', '5', 'Niet beoordeeld', 'Niet van toepassing']
      : question?.options;
    if (!options?.includes(value)) throw new Error('Ongeldige feedbackwaarde');
    answers[id] = value;
  }
  if ((source.note || '').length > 500) throw new Error('Notitie te lang');
  return { answers, note: source.note || '' };
}
