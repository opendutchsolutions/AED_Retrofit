import React, { useCallback, useRef, useState } from 'react';
import { useBLE } from './hooks/useBLE';
import { useAudio } from './hooks/useAudio';
import { useSimulation } from './hooks/useSimulation';
import { StatusChip, ConnectCard } from './components/StatusBar';
import { ScenarioPanel } from './components/ScenarioPanel';
import { AedDevicePanel } from './components/AedDevicePanel';
import { HardwarePanel } from './components/HardwarePanel';
import { ManualPanel } from './components/ManualPanel';
import { SessionLog } from './components/SessionLog';
import { ScenarioEditor } from './components/ScenarioEditor';
import { Card } from './components/UI';

const SCREENS = [
  { key: 'verbinden',  label: 'Verbinden',  eyebrow: 'Stap 1' },
  { key: 'oefenen',    label: 'Oefenen',     eyebrow: 'Stap 2' },
  { key: 'afronden',   label: 'Afronden',    eyebrow: 'Stap 3' },
];

const HERO_TEXT = {
  verbinden: {
    title: 'Verbind de oefen-AED',
    text: 'Maak verbinding via Bluetooth. Heb je geen oefen-AED bij de hand? Gebruik dan de simulatiestand.',
  },
  oefenen: {
    title: 'Start een oefenscenario',
    text: 'Kies de taal en start het scenario. Zonder apparaat draait de oefening in de simulatiestand.',
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
      <h1>{title}</h1>
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
  const { play: playAudio } = useAudio();

  // Forward ref so BLE hook can call into sim without circular dependency
  const simRef = useRef(null);
  const handleButtonChange = useCallback((mask) => {
    simRef.current?.handleButton(mask);
  }, []);

  const ble = useBLE({ onButtonChange: handleButtonChange });

  const sim = useSimulation({
    setLedMask: ble.setLedMask,
    allLedsOff: ble.allLedsOff,
    addLog: ble.addLog,
    playAudio,
  });
  simRef.current = sim;

  function onToggleLed(bit) {
    const next = ble.ledMask ^ (1 << bit);
    ble.setLedMask(next);
  }

  const connected = ble.status === 'connected';

  return (
    <>
      <header className="site-header">
        <div className="brand" aria-label="AED Oefensysteem">
          <span className="brand-mark" aria-hidden="true">♥</span>
          <div>
            <strong>AED Oefensysteem</strong>
            <span>Bediening voor instructeurs</span>
          </div>
        </div>
        <StatusChip status={ble.status} deviceName={ble.deviceName} />
      </header>

      <div className="app-shell">
        <nav className="main-nav" aria-label="Hoofdnavigatie">
          {SCREENS.map(({ key, label }) => (
            <button
              key={key}
              className={`nav-button${screen === key ? ' is-active' : ''}`}
              onClick={() => setScreen(key)}
              aria-current={screen === key ? 'page' : undefined}
            >
              <span aria-hidden="true">{SCREENS.findIndex(s => s.key === key) + 1}</span>
              {label}
            </button>
          ))}
        </nav>

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
                />
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
                  onStart={sim.start}
                  onStop={sim.stop}
                  onChooseBranch={sim.chooseBranch}
                  onSkipPhase={sim.skipPhase}
                  language={sim.language}
                  onLanguageChange={sim.setLanguage}
                  connected={connected}
                />
              </div>
            </section>
          )}

          {screen === 'bedienen' && (
            <section className="screen" aria-label="Bedienen">
              <Hero screen="bedienen" />
              {sim.running && sim.currentStep && (
                <div className="step-banner">
                  <span>
                    <strong>{sim.currentStep.label}</strong> — {sim.currentStep.instruction}
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
                <SessionLog entries={sim.sessionLog} onClear={sim.clearSessionLog} />
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
        </main>
      </div>

      <footer>
        <p>Copyright 2026 OpenDutchSolutions</p>
      </footer>
    </>
  );
}
