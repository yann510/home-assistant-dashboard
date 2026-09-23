// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasDialog } from './CanvasDialog';

afterEach(cleanup);

it('focuses the dialog, traps focus through selects, closes on Escape and restores the trigger', () => {
  const onClose = vi.fn();
  const view = render(
    <>
      <button>Open details</button>
    </>
  );
  const trigger = screen.getByRole('button', { name: 'Open details' });
  trigger.focus();
  view.rerender(
    <>
      <button>Open details</button>
      <CanvasDialog title='Settings' onClose={onClose}>
        <input aria-label='First setting' />
        <select aria-label='Room'>
          <option>Living room</option>
        </select>
      </CanvasDialog>
    </>
  );
  const dialog = screen.getByRole('dialog', { name: 'Settings' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(dialog);
  const close = screen.getByRole('button', { name: 'Close details' });
  expect(screen.getByRole('textbox', { name: 'First setting' })).toBeTruthy();
  close.focus();
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Room' }));
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
  view.rerender(<button>Open details</button>);
  expect(document.activeElement).toBe(trigger);
});
