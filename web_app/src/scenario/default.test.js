import { expect, test } from 'vitest';
import { DEFAULT_STEPS } from './default';

test('default scenario shows Geen schokbaar ritme instead of Geen puls', () => {
  const visibleText = DEFAULT_STEPS.flatMap(step => [
    step.label,
    step.instruction,
    ...(step.choices || []).map(choice => choice.label),
  ]).join('\n');

  expect(visibleText).not.toContain('Geen puls');
  expect(visibleText).toContain('Geen schokbaar ritme — stop sessie');
});
