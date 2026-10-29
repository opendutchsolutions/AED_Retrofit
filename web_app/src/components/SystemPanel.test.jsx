// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemPanel } from './SystemPanel';
import { detectCapabilities, parseFeedbackBackup, probeStorage } from '../system/capabilities';

afterEach(cleanup);

test('system check reports browser capabilities and distinguishes storage from device connection', () => {
  const rows = detectCapabilities({
    protocol: 'http:', storageAvailable: true, indexedDBAvailable: true,
    bluetoothAvailable: false, online: false, touch: false,
    reducedMotion: true, forcedColors: false,
  });
  expect(rows.find(row => row.label === 'Lokale opslag').value).toBe('Beschikbaar');
  expect(rows.find(row => row.label === 'Web Bluetooth').value).toBe('Niet beschikbaar');
  expect(rows.find(row => row.label === 'Internetverbinding').value).toBe('Offline');
  expect(rows.find(row => row.label === 'Reduced motion').value).toBe('Actief');
});

test('storage probe cleans up its key and handles blocked storage', () => {
  const data = new Map();
  const storage = {
    setItem: (key, value) => data.set(key, value),
    getItem: key => data.get(key),
    removeItem: key => data.delete(key),
  };
  expect(probeStorage(storage)).toBe(true);
  expect(data.size).toBe(0);
  expect(probeStorage({ setItem() { throw new Error('denied'); } })).toBe(false);
});

test('backup import accepts the reference format and rejects malformed data', () => {
  expect(parseFeedbackBackup(JSON.stringify({ answers: { 'algemene-veiligheid': '4' }, note: 'Goed' })))
    .toEqual({ answers: { 'algemene-veiligheid': '4' }, note: 'Goed' });
  expect(parseFeedbackBackup(JSON.stringify({ feedback: { answers: { diepte: 'Goed' }, note: '' } })))
    .toEqual({ answers: { diepte: 'Goed' }, note: '' });
  expect(() => parseFeedbackBackup('{')).toThrow();
  expect(() => parseFeedbackBackup(JSON.stringify({ answers: { diepte: '<script>' } }))).toThrow();
  expect(() => parseFeedbackBackup(JSON.stringify({ log: [] }))).toThrow();
});

test('system page exposes diagnostics, audio check and feedback backup controls', async () => {
  const user = userEvent.setup();
  const onTestAudio = vi.fn(async () => 'Testtoon afgespeeld via dit apparaat.');
  const onExport = vi.fn();
  const onImport = vi.fn();
  render(<SystemPanel storageAvailable={true} onTestAudio={onTestAudio} onExport={onExport} onImport={onImport} />);
  expect(screen.getByRole('heading', { name: 'Systeemcontrole' })).toBeTruthy();
  expect(screen.getByText('Beschikbare functies')).toBeTruthy();
  expect(screen.getByText(/alleen in deze browseromgeving opgeslagen/i)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Opslag testen' }));
  expect(screen.getByRole('status').textContent).toMatch(/Lokale opslag is beschikbaar/);
  await user.click(screen.getByRole('button', { name: 'Audio testen' }));
  expect(onTestAudio).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'JSON-reservekopie maken' }));
  expect(onExport).toHaveBeenCalledOnce();
  const file = new File(['{"answers":{},"note":""}'], 'backup.json', { type: 'application/json' });
  await user.upload(screen.getByLabelText('Reservekopie importeren'), file);
  expect(onImport).toHaveBeenCalledWith(file);
});

test('cancelled import does not claim a backup was restored', async () => {
  const user = userEvent.setup();
  render(<SystemPanel storageAvailable onTestAudio={async () => ''} onExport={() => {}} onImport={async () => false} />);
  await user.upload(screen.getByLabelText('Reservekopie importeren'), new File(['{"answers":{}}'], 'backup.json'));
  expect(screen.getByRole('status').textContent).toMatch(/geannuleerd/);
});
