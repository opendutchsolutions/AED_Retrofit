// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackPanel, FeedbackSummary } from './FeedbackPanel';
import { questionsForStep, summarizeFeedback } from '../feedback/model';

afterEach(cleanup);

test('questions follow the actual scenario step, including a second shock', () => {
  expect(questionsForStep('place-pads')).toContain('elektroden');
  expect(questionsForStep('shock-advised-2')).toContain('schokveiligheid');
  expect(questionsForStep('cpr-2')).toEqual(expect.arrayContaining(['diepte', 'frequentie', 'taakverdeling']));
});

test('a phase-specific answer is also shown in all categories and counted once', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const { rerender } = render(
    <FeedbackPanel step={{ id: 'shock-advised', label: 'Schok geadviseerd' }} answers={{}} note="" onChange={onChange} onBack={() => {}} />
  );
  expect(screen.getByRole('heading', { name: 'Schok geadviseerd' })).toBeTruthy();
  const quick = screen.getByRole('region', { name: 'Vragen bij deze fase' });
  const quickQuestion = within(quick).getByRole('group', { name: 'Veiligheid bij het geven van de schok' });
  await user.click(within(quickQuestion).getByRole('radio', { name: '5 – Uitstekend' }));
  expect(onChange).toHaveBeenCalledWith({ schokveiligheid: '5' }, '');
  rerender(
    <FeedbackPanel step={{ id: 'shock-advised', label: 'Schok geadviseerd' }} answers={{ schokveiligheid: '5' }} note="" onChange={onChange} onBack={() => {}} />
  );
  expect(screen.getByLabelText('Voortgang feedback').textContent).toMatch(/1onderdeel beoordeeld.*1sterk punt/);
  await user.click(screen.getByText('Alle feedbackonderdelen'));
  await user.click(screen.getByText(/Veiligheid en handelen —/));
  const fullQuestion = within(screen.getByRole('region', { name: 'Alle onderdelen' }))
    .getByRole('group', { name: 'Veiligheid bij het geven van de schok' });
  expect(within(fullQuestion).getByRole('radio', { name: '5 – Uitstekend', checked: true })).toBeTruthy();
});

test('neutral answers stay neutral, note survives and summary offers export and print', async () => {
  const user = userEvent.setup();
  const answers = { diepte: 'Te ondiep', frequentie: 'Niet beoordeeld', schokveiligheid: '4' };
  const onExport = vi.fn();
  const onPrint = vi.fn();
  expect(summarizeFeedback(answers)).toMatchObject({ answered: 3, strengths: 1, improvements: 1 });
  render(<FeedbackSummary answers={answers} note="Bespreek compressies." onEdit={() => {}} onExport={onExport} onPrint={onPrint} />);
  expect(screen.getByText(/Diepte van de borstcompressies: Te ondiep/)).toBeTruthy();
  expect(screen.getByText(/Veiligheid bij het geven van de schok: 4 van 5/)).toBeTruthy();
  expect(screen.getByText('Bespreek compressies.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'JSON exporteren' }));
  await user.click(screen.getByRole('button', { name: 'Afdrukken' }));
  expect(onExport).toHaveBeenCalledOnce();
  expect(onPrint).toHaveBeenCalledOnce();
});

test('feedback can be cleared intentionally', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  vi.stubGlobal('confirm', vi.fn(() => true));
  render(<FeedbackPanel step={null} answers={{ diepte: 'Goed' }} note="Notitie" onChange={onChange} onBack={() => {}} />);
  await user.click(screen.getByRole('button', { name: 'Feedback wissen' }));
  expect(onChange).toHaveBeenCalledWith({}, '');
  vi.unstubAllGlobals();
});
