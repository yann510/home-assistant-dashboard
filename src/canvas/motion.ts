/** Decorative motion must never hold up commands or focus restoration. */
export function animateCanvasChange(element: HTMLElement | null, frames: Keyframe[], duration = 180) {
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (!element?.animate || preference?.matches) return () => {};
  let animation: Animation;
  try {
    animation = element.animate(frames, { duration, easing: 'ease-out' });
  } catch {
    return () => {};
  }
  const stop = () => {
    preference?.removeEventListener?.('change', stop);
    animation.cancel();
  };
  preference?.addEventListener?.('change', stop);
  void animation.finished?.then(
    () => preference?.removeEventListener?.('change', stop),
    () => preference?.removeEventListener?.('change', stop)
  );
  return stop;
}

const exitingElements = new WeakSet<HTMLElement>();

/** An inert, short-lived visual copy lets the real panel close immediately. */
export function animateCanvasExit(element: HTMLElement | null) {
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (!element?.animate || preference?.matches || exitingElements.has(element)) return;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  exitingElements.add(element);
  const wrapper = document.createElement('div');
  wrapper.className = 'canvas canvas-dialog canvas-motion-exit';
  wrapper.inert = true;
  wrapper.setAttribute('aria-hidden', 'true');
  Object.assign(wrapper.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9999', background: 'transparent' });
  const copy = element.cloneNode(true) as HTMLElement;
  for (const node of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
    node.removeAttribute('id');
    node.removeAttribute('autofocus');
    node.removeAttribute('aria-live');
    node.removeAttribute('role');
    node.setAttribute('tabindex', '-1');
    if (node.hasAttribute('contenteditable')) node.setAttribute('contenteditable', 'false');
    // Fallback for older kiosk engines without native inert support.
    if (node.matches('button, input, select, textarea')) node.setAttribute('disabled', '');
    node.style.animation = 'none';
  }
  Object.assign(copy.style, {
    position: 'fixed',
    margin: '0',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    maxHeight: 'none',
    pointerEvents: 'none',
  });
  const style = getComputedStyle(element);
  for (const property of ['--canvas-room-accent', 'border-radius', 'padding', 'background-color', 'color']) {
    copy.style.setProperty(property, style.getPropertyValue(property));
  }
  wrapper.append(copy);
  document.body.append(wrapper);
  const originals = element.querySelectorAll('*');
  copy.querySelectorAll('*').forEach((node, index) => {
    node.scrollTop = originals[index].scrollTop;
  });
  let expiry: number | undefined;
  const remove = () => {
    wrapper.remove();
    preference?.removeEventListener?.('change', remove);
    if (expiry !== undefined) window.clearTimeout(expiry);
  };
  preference?.addEventListener?.('change', remove);
  try {
    const animation = copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out' });
    void animation.finished.then(remove, remove);
    // Background tabs or unusual animation implementations must not leave a copy behind.
    expiry = window.setTimeout(remove, 250);
  } catch {
    remove();
  }
}
