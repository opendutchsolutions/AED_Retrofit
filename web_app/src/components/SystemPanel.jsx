import React, { useEffect, useRef, useState } from 'react';
import { Card } from './UI';
import { inspectBrowser } from '../system/capabilities';

export function SystemPanel({ storageAvailable, onTestAudio, onExport, onImport }) {
  const [capabilities, setCapabilities] = useState(inspectBrowser);
  const [message, setMessage] = useState('');
  const fileRef = useRef(null);
  const storage = capabilities.find(item => item.label === 'Lokale opslag')?.value === 'Beschikbaar';

  useEffect(() => {
    const refresh = () => setCapabilities(inspectBrowser());
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
    };
  }, []);

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Bestand is te groot (maximaal 1 MB).');
      const imported = await onImport(file);
      setMessage(imported === false ? 'Importeren geannuleerd.' : 'Feedback-reservekopie geïmporteerd.');
    } catch (error) {
      setMessage(`Reservekopie kon niet worden gelezen. ${error.message}`);
    } finally {
      event.target.value = '';
    }
  }

  return (
    <section className="screen" aria-label="Systeemcontrole">
      <div className="hero">
        <p className="eyebrow">Techniek</p>
        <h1 tabIndex={-1}>Systeemcontrole</h1>
        <p>De applicatie controleert beschikbare browserfuncties, niet het merk of model van de oefen-AED.</p>
      </div>
      <p role="status" aria-live="polite" className="system-message">{message}</p>
      <div className="grid two">
        <Card>
          <h2>Beschikbare functies</h2>
          <dl className="system-capabilities">
            {capabilities.map(item => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd className={`capability-${item.kind}`}>{item.value}</dd>
              </div>
            ))}
          </dl>
          <p className="hint">Beschikbaar betekent alleen dat de browser deze functie aanbiedt; het bewijst geen verbinding met een apparaat.</p>
          <div className="button-row">
            <button className="button secondary" type="button" onClick={() => {
              const current = inspectBrowser();
              setCapabilities(current);
              setMessage(current.find(item => item.label === 'Lokale opslag')?.value === 'Beschikbaar'
                ? 'Lokale opslag is beschikbaar.' : 'Lokale opslag is niet beschikbaar.');
            }}>Opslag testen</button>
            <button className="button secondary" type="button" onClick={async () => {
              try { setMessage(await onTestAudio()); }
              catch { setMessage('Audio kon niet worden gestart. Controleer volume en browsertoestemming.'); }
            }}>Audio testen</button>
          </div>
        </Card>
        <Card>
          <h2>Opslag en overdracht</h2>
          <p>{storageAvailable && storage
            ? 'Gegevens worden alleen in deze browseromgeving opgeslagen. Er is geen synchronisatie met andere apparaten.'
            : 'Permanente lokale opslag is niet beschikbaar. Feedback blijft alleen beschikbaar zolang deze pagina openstaat.'}</p>
          <p className="hint">De JSON-reservekopie bevat alleen de feedback en notitie van de instructeur; geen scenario- of apparaatinstellingen.</p>
          <div className="button-row">
            <button className="button primary" type="button" onClick={onExport}>JSON-reservekopie maken</button>
            <button className="button secondary" type="button" onClick={() => fileRef.current?.click()}>Reservekopie importeren</button>
            <input ref={fileRef} className="sr-only" type="file" accept=".json,application/json" aria-label="Reservekopie importeren" onChange={importBackup} />
          </div>
        </Card>
      </div>
    </section>
  );
}
