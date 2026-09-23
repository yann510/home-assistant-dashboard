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

it('keeps navigation outside the scrolling body and resets or restores scroll for each route', () => {
  const onBack = vi.fn();
  const view = render(
    <CanvasDialog title='Devices' routeKey='devices' onClose={() => {}}>
      <button>Device</button>
    </CanvasDialog>
  );
  const body = screen.getByRole('button', { name: 'Device' }).parentElement!;
  body.scrollTop = 500;
  view.rerender(
    <CanvasDialog title='Light' routeKey='light:one' onBack={onBack} onClose={() => {}}>
      <button>Brightness</button>
    </CanvasDialog>
  );
  expect(body.scrollTop).toBe(0);
  const back = screen.getByRole('button', { name: 'Back' });
  expect(body.contains(back)).toBe(false);
  expect(body.contains(screen.getByRole('button', { name: 'Close details' }))).toBe(false);
  fireEvent.click(back);
  expect(onBack).toHaveBeenCalledOnce();
  body.scrollTop = 90;
  view.rerender(
    <CanvasDialog title='Devices' routeKey='devices' scrollTop={500} onClose={() => {}}>
      <button>Device</button>
    </CanvasDialog>
  );
  expect(body.scrollTop).toBe(500);
});
