import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useBLE } from './hooks/useBLE';
import { useAudio } from './hooks/useAudio';
import { useMetronome } from './hooks/useMetronome';
import { AUDIO_FILES } from './scenario/default';
import { useSimulation } from './hooks/useSimulation';
import { StatusChip, ConnectCard } from './components/StatusBar';
import { DeviceSummary } from './components/DeviceSummary';
import { ScenarioPanel } from './components/ScenarioPanel';
import { AedDevicePanel } from './components/AedDevicePanel';
import { HardwarePanel } from './components/HardwarePanel';
import { ManualPanel } from './components/ManualPanel';
import { SessionLog } from './components/SessionLog';
import { OtaPanel } from './components/OtaPanel';
import { ScenarioEditor } from './components/ScenarioEditor';
import { Card, Btn } from './components/UI';
import { NavigationMenu } from './components/NavigationMenu';
import { FeedbackPanel, FeedbackSummary } from './components/FeedbackPanel';
import { FEEDBACK_STORAGE_KEY, readSavedFeedback, summarizeFeedback } from './feedback/model';
import { SystemPanel } from './components/SystemPanel';
import { parseFeedbackBackup } from './system/capabilities';

const SCREENS = [
  { key: 'verbinden',  label: 'Verbind met een apparaat',  eyebrow: 'Stap 1' },
  { key: 'oefenen',    label: 'Begin met oefenen',     eyebrow: 'Stap 2' },
  { key: 'afronden',   label: 'Rond de oefening af',    eyebrow: 'Stap 3' },
];

const HERO_TEXT = {
  verbinden: {
    title: 'Verbind de oefen-AED',
    text: 'Maak verbinding via Bluetooth. Heb je geen oefen-AED bij de hand? Gebruik dan de simulatiestand.',
  },
  oefenen: {
    title: 'Start met oefenen',
    text: '',
  },
  afronden: {
    title: 'Rond de oefening af',
    text: 'Bekijk de verbinding, de lampjes, de zoemer en alle gebeurtenissen van de sessie.',
  },
  bedienen: {
    title: 'Bedien de oefen-AED',
    text: 'Simuleer de fysieke knoppen en sensoren. Iedere actie komt in het logboek.',
  },
  instructeur: {
    title: 'Instructeurbediening',
    text: 'Beheer scenario\u2019s, stuur lampjes en geluid handmatig aan en importeer of exporteer instellingen.',
  },
};

function Hero({ screen }) {
  const { title, text } = HERO_TEXT[screen];
  const current = SCREENS.find(s => s.key === screen);
  return (
    <div className="hero">
      <p className="eyebrow">{current ? current.eyebrow : 'Overig'}</p>
      <h1 tabIndex={-1}>{title}</h1>
      <p>{text}</p>
    </div>
  );
}

function DeviceStatusCard({ status, deviceName, running, ledMask }) {
  return (
    <Card>
      <h2>Apparaatstatus</h2>
      <dl className="summary-list">
        <div>
          <dt>Verbinding</dt>
          <dd>
            {status === 'connected' ? `Verbonden — ${deviceName || 'AED'}`
              : status === 'scanning' ? 'Zoeken…'
              : 'Niet verbonden'}
          </dd>
        </div>
        <div>
          <dt>Zoemer</dt>
          <dd>{(ledMask & (1 << 6)) ? 'Aan' : 'Uit'}</dd>
        </div>
        <div>
          <dt>Oefening</dt>
          <dd>{running ? 'Actief' : 'Niet actief'}</dd>
        </div>
      </dl>
    </Card>
  );
}

export default function App() {
  const [screen, setScreen] = useState('verbinden');
  const [feedbackReturnScreen, setFeedbackReturnScreen] = useState('oefenen');
  const [feedback, setFeedback] = useState(readSavedFeedback);
  const [feedbackSaveStatus, setFeedbackSaveStatus] = useState('Alleen in deze browser opgeslagen');
  useEffect(() => {
    try {
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(feedback));
      setFeedbackSaveStatus('Alleen in deze browser opgeslagen');
    } catch {
      setFeedbackSaveStatus('Tijdelijk bewaard zolang deze pagina openstaat');
    }
  }, [feedback]);

  function openFeedback(origin = screen) {
    setFeedbackReturnScreen(origin === 'afronden' ? 'afronden' : 'oefenen');
    setScreen('feedback');
    requestAnimationFrame(() => document.querySelector('#main h1')?.focus());
  }

  function returnFromFeedback() {
    setScreen(feedbackReturnScreen);
    requestAnimationFrame(() => {
      const target = feedbackReturnScreen === 'afronden'
        ? document.querySelector('.feedback-result button')
        : document.querySelector('.feedback-count')?.previousElementSibling;
      (target || document.querySelector('#main h1'))?.focus();
    });
  }

  function downloadJson(filename, data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportFeedback() {
    downloadJson('aed-training-feedback.json', {
      saved: new Date().toISOString(),
      feedback,
      steps: sim.steps.map(({ id, label }) => ({ id, label })),
      log: sim.sessionLog,
    });
  }

  async function importFeedbackBackup(file) {
    const text = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen.'));
      reader.readAsText(file);
    });
    const imported = parseFeedbackBackup(text);
    if ((Object.keys(feedback.answers).length || feedback.note) &&
      !window.confirm('Bestaande feedback vervangen door deze reservekopie?')) return false;
    setFeedback(imported);
    return true;
  }

  async function testAudioOutput() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio niet beschikbaar');
    const context = new AudioContextClass();
    try {
      await context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 660;
      gain.gain.value = 0.08;
      oscillator.connect(gain).connect(context.destination);
      const finished = new Promise(resolve => { oscillator.onended = resolve; });
      oscillator.start();
      oscillator.stop(context.currentTime + 0.6);
      await finished;
      return 'Testtoon afgespeeld via de standaard audio-uitgang van dit apparaat.';
    } finally {
      await context.close();
    }
  }
  const { play: playAudio, stop: stopAudio, pauseMain, resumeMain, playOverlay } = useAudio();
  const { start: startMetronome, stop: stopMetronome } = useMetronome();
  const [metronomeRatio, setMetronomeRatio] = useState(
    () => localStorage.getItem('metronome-ratio') || 'Uit'
  );
  useEffect(() => {
    localStorage.setItem('metronome-ratio', metronomeRatio);
  }, [metronomeRatio]);


  // Forward ref so BLE hook can call into sim without circular dependency
  const simRef = useRef(null);
  const prevBtnMaskRef = useRef(0);

  // Kindsleutel-check: an additional, non-blocking check anywhere in the
  // first three steps (warning / place_pads / analyse). When the child
  // key is inserted, its announcement interrupts the scenario prompt and
  // the prompt resumes where it left off once the announcement ends.
  const handleButtonChange = useCallback((mask) => {
    const CARD_BIT = 3; // card_slot / kindsleutel
    const wasInserted = (prevBtnMaskRef.current >> CARD_BIT) & 1;
    const isInserted = (mask >> CARD_BIT) & 1;
    prevBtnMaskRef.current = mask;
    if (isInserted && !wasInserted) {
      const sim = simRef.current;
      const step = sim?.currentStep;
      if (step && ['warning', 'place_pads', 'analyse'].includes(step.audioKey)) {
        const bank = sim?.audioBank || {};
        const lang = sim?.language || 'Nederlands';
        const map = AUDIO_FILES[lang] || AUDIO_FILES.Nederlands;
        const src = bank.kindsleutel?.url
          || map.kindsleutel
          || AUDIO_FILES.Nederlands.kindsleutel;
        const mainWasPlaying = pauseMain();
        playOverlay(src, () => {
          if (mainWasPlaying) resumeMain();
        });
        sim?.logSession && sim.logSession('Kindsleutel geactiveerd — melding afgespeeld', 'ok');
      }
    }
    simRef.current?.handleButton(mask);
  }, [playOverlay, pauseMain, resumeMain]);

  const ble = useBLE({ onButtonChange: handleButtonChange });

  const sim = useSimulation({
    setLedMask: ble.setLedMask,
    allLedsOff: ble.allLedsOff,
    addLog: ble.addLog,
    playAudio,
    stopAudio,
  });

  // Guide the compression/ventilation rhythm during the scenario's CPR
  // phase when a metronome ratio is selected
  useEffect(() => {
    if (sim.running && sim.currentStep?.metronome && metronomeRatio !== 'Uit') {
      startMetronome(metronomeRatio);
      return () => stopMetronome();
    }
    stopMetronome();
  }, [sim.running, sim.currentStep, metronomeRatio, startMetronome, stopMetronome]);
  simRef.current = sim;

  function onToggleLed(bit) {
    const next = ble.ledMask ^ (1 << bit);
    ble.setLedMask(next);
  }

  const connected = ble.status === 'connected';
  // Audible buzzer emulation for simulation mode: the trainer's zoemer
  // bit in the LED mask drives a continuous beep, so shock-advised and
  // don't-touch phases are also audible without hardware.
  const buzzerAudioRef = useRef(null);
  useEffect(() => {
    const on = !connected && !!(ble.ledMask & (1 << 6));
    if (on && !buzzerAudioRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 880;
        gain.gain.value = 0.06;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        buzzerAudioRef.current = { ctx, osc, gain };
      } catch (e) { /* no WebAudio */ }
    } else if (!on && buzzerAudioRef.current) {
      const { ctx, osc, gain } = buzzerAudioRef.current;
      try {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        osc.stop(ctx.currentTime + 0.1);
        ctx.close();
      } catch (e) { /* already closed */ }
      buzzerAudioRef.current = null;
    }
  }, [ble.ledMask, connected]);


  // Classic audio hint: shown after BLE connect until the classic audio link
  // is up (bit0 = peer known, bit1 = classic connected — see fw gatt_service.c)
  const [audioHintDismissed, setAudioHintDismissed] = useState(false);
  useEffect(() => {
    if (ble.status === 'connected') setAudioHintDismissed(false);
  }, [ble.status]);

  const classicOk = ble.classicStatus !== null && (ble.classicStatus & 0b11) === 0b11;
  const classicPeerKnown = ble.classicStatus !== null && (ble.classicStatus & 1) !== 0;

  // The classic-audio link can take up to ~10 s to (re)establish after the
  // device reports the paired peer. Hold the hint back for that window so
  // it doesn't pop up while the connection is still coming up.
  const [classicGraceOver, setClassicGraceOver] = useState(false);
  useEffect(() => {
    if (ble.classicStatus === null || classicOk) {
      setClassicGraceOver(false);
      return;
    }
    setClassicGraceOver(false);
    const t = setTimeout(() => setClassicGraceOver(true), 10000);
    return () => clearTimeout(t);
  }, [ble.classicStatus, classicOk]);

  const showAudioHint =
    connected && !audioHintDismissed && ble.classicStatus !== null &&
    !classicOk && classicGraceOver;

  return (
    <>
      <a className="skip-link" href="#main">Ga naar de hoofdinhoud</a>
      <header className="site-header">
        <div className="brand" aria-label="AED Oefensysteem">
          <img className="brand-mark" src="ods-logo.svg" alt="" aria-hidden="true" />
          <div>
            <strong>AED Oefensysteem</strong>
            <span>Bediening voor instructeurs</span>
          </div>
        </div>
        <StatusChip status={ble.status} deviceName={ble.deviceName} />
        <NavigationMenu
          screen={screen}
          onNavigate={key => {
            if (key === 'feedback') {
              openFeedback();
              return;
            }
            setScreen(key);
            requestAnimationFrame(() => document.querySelector('#main h1')?.focus());
          }}
        />
      </header>

      <div className="app-shell">
        <main id="main" tabIndex={-1}>
          {screen === 'verbinden' && (
            <section className="screen" aria-labelledby="h-verbinden">
              <Hero screen="verbinden" />
              <div className="grid two">
                <ConnectCard
                  status={ble.status}
                  deviceName={ble.deviceName}
                  onConnect={ble.connect}
                  onDisconnect={ble.disconnect}
                  knownDevices={ble.knownDevices}
                  onReconnect={ble.reconnect}
                  available={ble.available}
                  error={ble.log.find(e => e.type === 'err')?.msg}
                />
                {connected ? (
                  <DeviceSummary
                    deviceName={ble.deviceName}
                    classicStatus={ble.classicStatus}
                    fwVersion={ble.fwVersion}
                    getDevice={ble.getDevice}
                    setOtaActive={ble.setOtaActive}
                  />
                ) : (
                  <Card>
                    <h2>Geen apparaat beschikbaar?</h2>
                    <p>
                      Start de oefening zonder verbinding: het scenario draait dan volledig in de
                      simulatiestand. Ga naar <strong>Oefenen</strong> en kies
                      {' '}<strong>Start oefening (simulatie)</strong>.
                    </p>
                    <div className="button-row">
                      <button className="button secondary" onClick={() => setScreen('oefenen')}>
                        Naar Oefenen
                      </button>
                    </div>
                  </Card>
                )}
              </div>
            </section>
          )}

          {screen === 'oefenen' && (
            <section className="screen" aria-label="Oefenen">
              <Hero screen="oefenen" />
              <div className="grid two oefenen-grid">
                <AedDevicePanel
                  ledMask={ble.ledMask}
                  btnMask={ble.btnMask}
                  expectedButton={sim.expectedButton}
                  onPressBtn={ble.simulateButton}
                  running={sim.running}
                />
                <ScenarioPanel
                  running={sim.running}
                  currentStep={sim.currentStep}
                  waitingBranch={sim.waitingBranch}
                  timeLeft={sim.timeLeft}
                  onStart={() => {
                    setFeedback({ answers: {}, note: '' });
                    sim.start();
                  }}
                  onStop={sim.stop}
                  onChooseBranch={sim.chooseBranch}
                  onSkipPhase={sim.skipPhase}
                  onFeedback={() => openFeedback('oefenen')}
                  feedbackCount={summarizeFeedback(feedback.answers).answered}
                  language={sim.language}
                  onLanguageChange={sim.setLanguage}
                  metronome={metronomeRatio}
                  onMetronomeChange={setMetronomeRatio}
                  connected={connected}
                />
              </div>
            </section>
          )}

          {screen === 'feedback' && (
            <section className="screen" aria-label="Feedback">
              <FeedbackPanel
                step={sim.currentStep}
                answers={feedback.answers}
                note={feedback.note}
                onChange={(answers, note) => setFeedback({ answers, note })}
                onBack={returnFromFeedback}
                backLabel={feedbackReturnScreen === 'afronden' ? 'Opslaan en terug naar afronden' : 'Opslaan en terug naar training'}
                saveStatus={feedbackSaveStatus}
              />
            </section>
          )}

          {screen === 'bedienen' && (
            <section className="screen" aria-label="Bedienen">
              <Hero screen="bedienen" />
              {sim.running && sim.currentStep && (
                <div className="step-banner">
                  <span>
                    <strong>{sim.currentStep.label}</strong> — {(sim.currentStep.metronome && metronomeRatio !== 'Uit')
                      ? sim.currentStep.instruction.replace(/30:2/g, metronomeRatio)
                      : sim.currentStep.instruction}
                  </span>
                  <button className="button compact secondary" onClick={() => setScreen('oefenen')}>
                    Naar Oefenen
                  </button>
                </div>
              )}
              <div className="grid">
                <HardwarePanel
                  ledMask={ble.ledMask}
                  btnMask={ble.btnMask}
                  onToggleLed={onToggleLed}
                  onPressBtn={ble.simulateButton}
                  readOnly={sim.running}
                />
              </div>
            </section>
          )}

          {screen === 'afronden' && (
            <section className="screen" aria-label="Afronden">
              <Hero screen="afronden" />
              <div className="grid status-layout">
                <DeviceStatusCard
                  status={ble.status}
                  deviceName={ble.deviceName}
                  running={sim.running}
                  ledMask={ble.ledMask}
                />
                <FeedbackSummary
                  answers={feedback.answers}
                  note={feedback.note}
                  onEdit={() => openFeedback('afronden')}
                  onExport={exportFeedback}
                  onPrint={() => window.print()}
                />
                <SessionLog entries={sim.sessionLog} onClear={sim.clearSessionLog} />
                <OtaPanel connected={connected} fwVersion={ble.fwVersion} getDevice={ble.getDevice} setOtaActive={ble.setOtaActive} />
              </div>
            </section>
          )}

          {screen === 'instructeur' && (
            <section className="screen" aria-label="Instructeur">
              <Hero screen="instructeur" />
              <div className="grid two">
                <ScenarioEditor
                  steps={sim.steps}
                  onStepsChange={sim.setSteps}
                  disabled={sim.running}
                  language={sim.language}
                  audioBank={sim.audioBank}
                  onAddAudio={sim.addAudioFile}
                  onRemoveAudio={sim.removeAudioFile}
                  getExportEntries={sim.getAudioExportEntries}
                  onImportAudio={sim.importAudioEntries}
                />
                <ManualPanel
                  ledMask={ble.ledMask}
                  onToggleLed={onToggleLed}
                  onAllOff={ble.allLedsOff}
                  onPlayAudio={playAudio}
                  disabled={!connected}
                />
              </div>
            </section>
          )}

          {screen === 'systeemcontrole' && (
            <SystemPanel
              storageAvailable={feedbackSaveStatus === 'Alleen in deze browser opgeslagen'}
              onTestAudio={testAudioOutput}
              onExport={() => downloadJson('aed-feedback-reservekopie.json', {
                version: 1, saved: new Date().toISOString(), feedback,
              })}
              onImport={importFeedbackBackup}
            />
          )}
        </main>
      </div>

      <footer>
        <p>Copyright 2026 OpenDutchSolutions</p>
      </footer>

      {showAudioHint && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="audio-hint-title">
          <div className="card dialog-box">
            <h2 id="audio-hint-title">Audioverbinding instellen</h2>
            <p>
              {classicPeerKnown
                ? 'De oefen-AED is gekoppeld, maar de Bluetooth-audioverbinding is niet actief. Herstel die via de systeeminstellingen:'
                : 'De gesproken instructies van de oefen-AED gaan via Bluetooth audio. Koppel het apparaat eenmalig via de systeeminstellingen:'}
            </p>
            <ol className="steps">
              <li>Open <strong>Instellingen</strong> en tik op <strong>Bluetooth</strong>.</li>
              <li>Zet Bluetooth aan als dat nog niet is gebeurd.</li>
              <li>Zoek onder <strong>Mijn apparaten</strong> naar <strong>AED-Simulator-1</strong> en tik erop om te koppelen of te verbinden.</li>
              <li>Keer terug naar deze web app; de verbinding komt daarna vanzelf tot stand.</li>
            </ol>
            <p className="hint">
              Dit venster sluit automatisch zodra de oefen-AED de audioverbinding meldt.
            </p>
            <div className="button-row">
              <Btn variant="primary" onClick={() => setAudioHintDismissed(true)}>Begrepen</Btn>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
