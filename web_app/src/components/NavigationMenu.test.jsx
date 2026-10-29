// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NavigationMenu } from './NavigationMenu';

beforeEach(() => {
  // jsdom does not implement native modal dialog methods.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(cleanup);

test('menu opens with the reference navigation, highlights the current page and closes on selection', async () => {
  const user = userEvent.setup();
  const navigate = vi.fn();
  render(<NavigationMenu screen="verbinden" onNavigate={navigate} />);

  const trigger = screen.getByRole('button', { name: /menu/i });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  await user.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  const dialog = screen.getByRole('dialog');
  expect(dialog.open).toBe(true);
  expect(screen.getByRole('button', { name: 'Verbinden' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('button', { name: 'Feedback' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Systeemcontrole' }).disabled).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Training' }));
  expect(navigate).toHaveBeenCalledWith('oefenen');
  expect(dialog.open).toBe(false);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

test('closing the menu returns keyboard focus to its trigger', async () => {
  const user = userEvent.setup();
  render(<NavigationMenu screen="oefenen" onNavigate={() => {}} />);
  const trigger = screen.getByRole('button', { name: /menu/i });
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Menu sluiten' }));
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
