// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScenarioPanel } from './ScenarioPanel';

afterEach(cleanup);

test('instructor can open phase-aware feedback without ending the training', async () => {
  const user = userEvent.setup();
  const onFeedback = vi.fn();
  const onStop = vi.fn();
  render(<ScenarioPanel
    running currentStep={{ id: 'cpr-2', label: 'Reanimatiecyclus', instruction: 'Start reanimatie.', type: 'timed', duration_seconds: 120 }}
    waitingBranch={false} timeLeft={90} onStart={() => {}} onStop={onStop}
    onChooseBranch={() => {}} onSkipPhase={() => {}} onFeedback={onFeedback}
    feedbackCount={2} language="Nederlands" onLanguageChange={() => {}}
    metronome="Uit" onMetronomeChange={() => {}} connected={false}
  />);
  await user.click(screen.getByRole('button', { name: 'Feedback vastleggen' }));
  expect(onFeedback).toHaveBeenCalledOnce();
  expect(onStop).not.toHaveBeenCalled();
  expect(screen.getByText('2 beoordeeld')).toBeTruthy();
});
