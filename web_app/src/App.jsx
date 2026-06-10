import React, { useCallback, useRef } from 'react';
import { useBLE, LED_BITS } from './hooks/useBLE';
import { useAudio } from './hooks/useAudio';
import { useSimulation } from './hooks/useSimulation';
import { StatusBar } from './components/StatusBar';
import { ScenarioPanel } from './components/ScenarioPanel';
import { HardwarePanel } from './components/HardwarePanel';
import { ManualPanel } from './components/ManualPanel';
import { SessionLog } from './components/SessionLog';
import { ScenarioEditor } from './components/ScenarioEditor';

export default function App() {
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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'var(--bg2)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          background: 'var(--red-bg)', border: '1px solid var(--red-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: 'var(--red)', fontWeight: 700,
        }}>
          ♥
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>AED Simulator</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>Instructor dashboard</div>
        </div>
      </div>

      {/* Main layout */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        gridTemplateRows: 'auto',
        gap: 12,
        padding: 16,
        alignItems: 'start',
      }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <StatusBar
            status={ble.status}
            deviceName={ble.deviceName}
            onConnect={ble.connect}
            onDisconnect={ble.disconnect}
          />

          <ScenarioPanel
            running={sim.running}
            currentStep={sim.currentStep}
            waitingBranch={sim.waitingBranch}
            timeLeft={sim.timeLeft}
            onStart={sim.start}
            onStop={sim.stop}
            onChooseBranch={sim.chooseBranch}
            language={sim.language}
            onLanguageChange={sim.setLanguage}
            connected={ble.status === 'connected'}
          />

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

          <SessionLog
            entries={sim.sessionLog}
            onClear={sim.clearSessionLog}
          />
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <HardwarePanel
            ledMask={ble.ledMask}
            btnMask={ble.btnMask}
            onToggleLed={onToggleLed}
            onPressBtn={ble.simulateButton}
            readOnly={sim.running}
          />

          <ManualPanel
            ledMask={ble.ledMask}
            onToggleLed={onToggleLed}
            onAllOff={ble.allLedsOff}
            onPlayAudio={playAudio}
            disabled={ble.status !== 'connected'}
          />
        </div>
      </div>
    </div>
  );
}
