/** A decorative handoff; playback and closing never depend on animation support. */
export function animateFavouriteArtwork(source: HTMLImageElement | null, target: Element | null) {
  if (!source?.complete || !source.naturalWidth || !target ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches || !source.animate) return;
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const visible = (rect: DOMRect) => rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0 &&
    rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
  if (!visible(from) || !visible(to)) return;

  const artwork = source.cloneNode() as HTMLImageElement;
  artwork.alt = '';
  artwork.setAttribute('aria-hidden', 'true');
  Object.assign(artwork.style, {
    position: 'fixed', left: `${from.left}px`, top: `${from.top}px`,
    width: `${from.width}px`, height: `${from.height}px`,
    objectFit: 'cover', borderRadius: getComputedStyle(source).borderRadius,
    pointerEvents: 'none', zIndex: '10000', transformOrigin: 'top left',
  });
  document.body.append(artwork);
  const remove = () => artwork.remove();
  try {
    const animation = artwork.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`, opacity: 0.85 },
    ], { duration: 420, easing: 'cubic-bezier(.22,.7,.25,1)', fill: 'forwards' });
    // Also clean up if the browser cancels animations (navigation, reduced motion).
    void animation.finished.then(remove, remove);
  } catch {
    remove();
  }
}
