// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { FEEDBACK_STORAGE_KEY } from './feedback/model';

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  vi.stubGlobal('requestAnimationFrame', callback => setTimeout(callback, 0));
  vi.stubGlobal('Audio', class { play() { return Promise.resolve(); } pause() {} });
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('training opens contextual feedback, returns without stopping and shows results on Afronden', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /menu/i }));
  await user.click(screen.getByRole('button', { name: 'Training' }));
  await user.click(screen.getByRole('button', { name: 'Start oefening (simulatie)' }));
  await user.click(screen.getByRole('button', { name: 'Feedback vastleggen' }));
  expect(screen.getByRole('heading', { name: 'Aanzetten' })).toBeTruthy();
  const question = within(screen.getByRole('region', { name: 'Vragen bij deze fase' }))
    .getByRole('group', { name: 'Algemene veiligheid' });
  await user.click(within(question).getByRole('radio', { name: '5 – Uitstekend' }));
  await user.click(screen.getByRole('button', { name: 'Opslaan en terug naar training' }));
  expect(screen.getByRole('button', { name: 'Oefening beëindigen' })).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Feedback vastleggen' })));
  await user.click(screen.getByRole('button', { name: /menu/i }));
  await user.click(screen.getByRole('button', { name: 'Afronden' }));
  expect(screen.getByText('Algemene veiligheid: 5 van 5')).toBeTruthy();
  expect(JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY)).answers['algemene-veiligheid']).toBe('5');
});

test('system check imports feedback from a reference backup into the training flow', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /menu/i }));
  await user.click(screen.getByRole('button', { name: 'Systeemcontrole' }));
  expect(screen.getByRole('heading', { name: 'Systeemcontrole' })).toBeTruthy();
  const file = new File([JSON.stringify({ answers: { 'algemene-veiligheid': '4' }, note: 'Testnotitie' })], 'backup.json', { type: 'application/json' });
  await user.upload(screen.getByLabelText('Reservekopie importeren'), file);
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Systeemcontrole' })).getByRole('status').textContent).toMatch(/geïmporteerd/));
  await user.click(screen.getByRole('button', { name: /menu/i }));
  await user.click(screen.getByRole('button', { name: 'Afronden' }));
  expect(screen.getByText('Algemene veiligheid: 4 van 5')).toBeTruthy();
  expect(screen.getByText('Testnotitie')).toBeTruthy();
});
