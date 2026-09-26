// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ColourWheel } from './ColourWheel';

afterEach(cleanup);
function wheel(disabled = false) {
  const onChange = vi.fn();
  render(<ColourWheel value='#ff0000' disabled={disabled} onChange={onChange} />);
  const control = screen.getByRole('slider', { name: 'Colour wheel' });
  control.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  control.setPointerCapture = vi.fn();
  control.releasePointerCapture = vi.fn();
  return { control, onChange };
}
function pointer(control: HTMLElement, type: string, x: number, y: number) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y });
  fireEvent(control, event);
}
it('selects white at the center and clamps drag coordinates to the colour rim', () => {
  const { control, onChange } = wheel();
  pointer(control, 'pointerdown', 50, 50);
  expect(onChange).toHaveBeenLastCalledWith('#ffffff');
  pointer(control, 'pointermove', 50, 500);
  expect(onChange).toHaveBeenLastCalledWith('#80ff00');
  pointer(control, 'pointerup', 100, 50);
  expect(onChange).toHaveBeenLastCalledWith('#ff0000');
  expect(control.releasePointerCapture).toHaveBeenCalledWith(1);
});
it('restores the original draft when a pointer gesture is cancelled', () => {
  const { control, onChange } = wheel();
  pointer(control, 'pointerdown', 50, 50);
  pointer(control, 'pointercancel', 50, 50);
  expect(onChange).toHaveBeenLastCalledWith('#ff0000');
  onChange.mockClear();
  pointer(control, 'pointermove', 0, 0);
  expect(onChange).not.toHaveBeenCalled();
});
it('supports keyboard hue and saturation changes without applying commands', () => {
  const { control, onChange } = wheel();
  fireEvent.keyDown(control, { key: 'ArrowRight', shiftKey: true });
  expect(onChange).toHaveBeenLastCalledWith('#ff2a00');
  fireEvent.keyDown(control, { key: 'Home' });
  expect(onChange).toHaveBeenLastCalledWith('#ffffff');
});
it('ignores pointer and keyboard input when disabled', () => {
  const { control, onChange } = wheel(true);
  pointer(control, 'pointerdown', 50, 50);
  fireEvent.keyDown(control, { key: 'ArrowRight' });
  expect(onChange).not.toHaveBeenCalled();
  expect(control.tabIndex).toBe(-1);
});
