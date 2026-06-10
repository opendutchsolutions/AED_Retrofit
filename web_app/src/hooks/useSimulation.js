import { useState, useRef, useCallback, useEffect } from 'react';
import { DEFAULT_STEPS, AUDIO_FILES, buildStepMap, ledMaskFromObj } from '../scenario/default';
import { useAudioBank } from './useAudioBank';

export function useSimulation({ setLedMask, allLedsOff, addLog, playAudio }) {
  const [running, setRunning]       = useState(false);
  const [currentStepId, setCurrentStepId] = useState(null);
  const [waitingBranch, setWaitingBranch] = useState(false);
  const [timeLeft, setTimeLeft]     = useState(null);
  const [sessionLog, setSessionLog] = useState([]);
  const [language, setLanguage]     = useState('Nederlands');
  const [steps, setSteps]           = useState(DEFAULT_STEPS);

  const audioBank = useAudioBank();

  const stepMap       = useRef(buildStepMap(DEFAULT_STEPS));
  const audioBankRef  = useRef(audioBank.bank);
  const timerRef      = useRef(null);
  const countRef      = useRef(null);
  const buzzerTimerRef = useRef(null);
  const expectBtn     = useRef(null);
  const onTimeoutRef  = useRef(null);

  // keep stepMap and audioBankRef in sync
  useEffect(() => { stepMap.current = buildStepMap(steps); }, [steps]);
  useEffect(() => { audioBankRef.current = audioBank.bank; }, [audioBank.bank]);

  const logSession = useCallback((msg, type='') => {
    const t = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    setSessionLog(l => [...l, { t, msg, type, id: Date.now() + Math.random() }]);
    addLog(msg, type);
  }, [addLog]);

  const clearTimers = useCallback(() => {
    if (timerRef.current)     { clearTimeout(timerRef.current);   timerRef.current = null; }
    if (countRef.current)     { clearInterval(countRef.current);  countRef.current = null; }
    if (buzzerTimerRef.current) { clearTimeout(buzzerTimerRef.current); buzzerTimerRef.current = null; }
    setTimeLeft(null);
    expectBtn.current    = null;
    onTimeoutRef.current = null;
  }, []);

  const gotoStep = useCallback((id) => {
    clearTimers();
    setWaitingBranch(false);

    const step = stepMap.current[id];
    if (!step) { addLog(`Unknown step: ${id}`, 'err'); return; }

    setCurrentStepId(id);
    logSession(`→ ${step.label}`, 'step');

    // Apply LEDs + buzzer
    const mask = ledMaskFromObj(step.leds);
    setLedMask(mask);

    // Auto-clear buzzer after duration if set
    if ((mask & (1 << 6)) && step.buzzer_duration_ms > 0) {
      buzzerTimerRef.current = setTimeout(() => {
        buzzerTimerRef.current = null;
        setLedMask(mask & ~(1 << 6));
      }, step.buzzer_duration_ms);
    }

    // Play audio — custom bank takes priority over built-in files
    const audioMap = AUDIO_FILES[language] || AUDIO_FILES['Nederlands'];
    if (step.audioKey) {
      const customEntry = audioBankRef.current[step.audioKey];
      playAudio(customEntry ? customEntry.url : audioMap[step.audioKey]);
    }

    if (step.type === 'button') {
      expectBtn.current = step.expect_button;

      if (step.timeout_seconds) {
        setTimeLeft(step.timeout_seconds);
        countRef.current = setInterval(() => {
          setTimeLeft(t => {
            if (t <= 1) {
              clearInterval(countRef.current);
              countRef.current = null;
              return 0;
            }
            return t - 1;
          });
        }, 1000);

        onTimeoutRef.current = step.on_timeout;
        timerRef.current = setTimeout(() => {
          logSession(`Timeout on "${step.label}"`, 'warn');
          if (step.on_timeout) gotoStep(step.on_timeout);
        }, step.timeout_seconds * 1000);
      }
    } else if (step.type === 'timed') {
      const dur = step.duration_seconds || 10;
      setTimeLeft(dur);
      countRef.current = setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            clearInterval(countRef.current);
            countRef.current = null;
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      timerRef.current = setTimeout(() => {
        logSession(`Timed step "${step.label}" complete`, 'ok');
        if (step.on_complete) gotoStep(step.on_complete);
      }, dur * 1000);
    } else if (step.type === 'branch') {
      setWaitingBranch(true);
    } else if (step.type === 'end') {
      allLedsOff();
      setRunning(false);
      logSession('Scenario complete', 'ok');
    }
  }, [clearTimers, setLedMask, allLedsOff, playAudio, language, logSession, addLog]);

  const start = useCallback(() => {
    setSessionLog([]);
    setRunning(true);
    logSession('Session started', 'ok');
    gotoStep(steps[0]?.id);
  }, [gotoStep, steps, logSession]);

  const stop = useCallback(() => {
    clearTimers();
    setRunning(false);
    setCurrentStepId(null);
    setWaitingBranch(false);
    allLedsOff();
    logSession('Session stopped', 'err');
  }, [clearTimers, allLedsOff, logSession]);

  const chooseBranch = useCallback((nextId) => {
    setWaitingBranch(false);
    logSession(`Branch → ${nextId}`, 'branch');
    gotoStep(nextId);
  }, [gotoStep, logSession]);

  // Called by BLE hook on button notify
  const handleButton = useCallback((mask) => {
    if (!running || !expectBtn.current) return;
    const BTN_BITS = { shock:0, on_off:1, info:2, card_slot:3, pads_inserted:4 };
    const bit = BTN_BITS[expectBtn.current];
    if (bit === undefined) return;
    if (mask & (1 << bit)) {
      const step = stepMap.current[currentStepId];
      logSession(`Button "${expectBtn.current}" pressed ✓`, 'ok');
      if (step?.on_correct) gotoStep(step.on_correct);
    }
  }, [running, currentStepId, gotoStep, logSession]);

  const clearSessionLog = useCallback(() => setSessionLog([]), []);

  const currentStep = currentStepId ? stepMap.current[currentStepId] : null;

  return {
    running, currentStep, waitingBranch, timeLeft, sessionLog,
    language, setLanguage,
    steps, setSteps,
    start, stop, chooseBranch, handleButton, clearSessionLog,
    audioBank:          audioBank.bank,
    addAudioFile:       audioBank.addFile,
    removeAudioFile:    audioBank.removeFile,
    getAudioExportEntries: audioBank.getExportEntries,
    importAudioEntries: audioBank.importEntries,
  };
}
