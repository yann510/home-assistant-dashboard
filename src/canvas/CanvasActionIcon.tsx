type Action = 'previous' | 'play' | 'pause' | 'next' | 'open' | 'forward';

/** Decorative currentColor vectors match the existing blinds and vacuum controls. */
export function CanvasActionIcon({ action, size = '1em' }: { action: Action; size?: number | string }) {
  return (
    <svg
      viewBox='0 0 24 24'
      width={size}
      height={size}
      fill='none'
      stroke='currentColor'
      strokeWidth='1.8'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
      focusable='false'
      style={{ verticalAlign: 'middle', flexShrink: 0 }}
    >
      {action === 'previous' && <path d='M6 5h2v14H6zM19 5v14L9 12Z' fill='currentColor' stroke='none' />}
      {action === 'play' && <path d='m8 5 11 7-11 7Z' fill='currentColor' stroke='none' />}
      {action === 'pause' && <path d='M7 5h3v14H7zM14 5h3v14h-3z' fill='currentColor' stroke='none' />}
      {action === 'next' && <path d='M16 5h2v14h-2zM5 5l10 7-10 7Z' fill='currentColor' stroke='none' />}
      {action === 'open' && <path d='M6 18 18 6M6 6h12v12' />}
      {action === 'forward' && <path d='M4 12h16m-7-7 7 7-7 7' />}
    </svg>
  );
}
