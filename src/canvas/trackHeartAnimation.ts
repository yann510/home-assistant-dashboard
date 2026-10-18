/** Decorations must never turn a confirmed save into an application failure. */
export function animateTrackHeart(element: HTMLElement, saved: boolean): () => void {
  const animations: Animation[] = [];
  const particles: HTMLElement[] = [];
  let media: MediaQueryList | undefined;
  let stopped = false;
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    for (const animation of animations) {
      try {
        animation.cancel();
      } catch {
        /* best effort */
      }
    }
    for (const particle of particles) particle.remove();
    try {
      media?.removeEventListener('change', onMotionChange);
    } catch {
      /* older browser */
    }
  };
  function onMotionChange() {
    if (media?.matches) cleanup();
  }
  try {
    media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (media?.matches) return cleanup;
    const icon = element.querySelector<HTMLElement>('[data-heart-icon]');
    const layer = element.querySelector<HTMLElement>('[data-heart-decoration]');
    if (!icon?.animate || !layer) return cleanup;
    media?.addEventListener('change', onMotionChange);
    layer.setAttribute('aria-hidden', 'true');
    layer.style.pointerEvents = 'none';
    const options = { duration: saved ? 420 : 240, easing: 'ease-out' };
    animations.push(
      icon.animate(
        saved
          ? [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.45 }, { transform: 'scale(1)' }]
          : [
              { transform: 'scale(1) rotate(0deg)' },
              { transform: 'scale(.82) rotate(-7deg)', offset: 0.4 },
              { transform: 'scale(1) rotate(0deg)' },
            ],
        options
      )
    );
    if (saved)
      for (const [x, y] of [
        [-12, -10],
        [12, -12],
        [14, 7],
        [-11, 10],
      ]) {
        const particle = document.createElement('span');
        particle.className = 'canvas-track-heart__sparkle';
        particle.textContent = '✦';
        particles.push(particle);
        layer.append(particle);
        animations.push(
          particle.animate(
            [
              { opacity: 0, transform: 'translate(0, 0) scale(.4)' },
              { opacity: 1, offset: 0.3 },
              { opacity: 0, transform: `translate(${x}px, ${y}px) scale(.7)` },
            ],
            options
          )
        );
      }
    void Promise.all(animations.map(animation => animation.finished)).then(cleanup, cleanup);
  } catch {
    cleanup();
  }
  return cleanup;
}
