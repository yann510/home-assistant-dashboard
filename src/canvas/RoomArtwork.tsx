import type { CSSProperties } from 'react';
import { getRoomAccent, roomKind } from './room-artwork';
import './room-artwork.css';

export function RoomArtwork({ room, className }: { room: string; className?: string }) {
  const kind = roomKind(room);
  return (
    <svg
      className={['canvas-room-artwork', className].filter(Boolean).join(' ')}
      viewBox='0 0 36 46'
      aria-hidden='true'
      focusable='false'
      style={{ '--canvas-room-accent': getRoomAccent(room) } as CSSProperties}
    >
      {kind === 'living' ? (
        <>
          <circle className='canvas-room-artwork__solid' cx='26' cy='10' r='4' />
          <rect className='canvas-room-artwork__wash' x='7' y='19' width='22' height='15' rx='4' />
          <path d='M7 27v-4q0-4 4-4h14q4 0 4 4v4M7 39v3M29 39v3M8 32h20M18 21v10' />
          <path d='M3 38V28a3 3 0 0 1 6 0v5h18v-5a3 3 0 0 1 6 0v10ZM26 2v1M18 10h-1M33 10h1' />
        </>
      ) : kind === 'bedroom' ? (
        <>
          <path className='canvas-room-artwork__solid' d='M26 3a7 7 0 1 0 3 12 8 8 0 0 1-3-12Z' />
          <rect className='canvas-room-artwork__wash' x='4' y='28' width='28' height='10' rx='2' />
          <path d='M4 42V22M32 42V28M4 38h28M4 29h28M8 28v-5q0-2 2-2h5q2 0 2 2v5M20 28v-5q0-2 2-2h5q2 0 2 2v5' />
        </>
      ) : kind === 'gym' ? (
        <>
          <circle className='canvas-room-artwork__solid' cx='18' cy='9' r='4' />
          <path d='M18 2V1M11 9H9M25 9h2M18 16v1M10 27h16M10 31h16' />
          <rect className='canvas-room-artwork__wash' x='5' y='21' width='5' height='17' rx='1.5' />
          <rect className='canvas-room-artwork__wash' x='26' y='21' width='5' height='17' rx='1.5' />
          <path d='M5 21h5v17H5ZM26 21h5v17h-5ZM2 25v9M34 25v9' />
        </>
      ) : kind === 'office' ? (
        <>
          <rect className='canvas-room-artwork__wash' x='6' y='10' width='24' height='17' rx='2' />
          <rect x='6' y='10' width='24' height='17' rx='2' />
          <path d='M18 27v6M12 33h12M3 35h30M6 35v7M30 35v7M10 14h8' />
          <circle className='canvas-room-artwork__solid' cx='28' cy='4' r='2' />
        </>
      ) : kind === 'kitchen' ? (
        <>
          <path className='canvas-room-artwork__wash' d='M9 21h16l3 16q0 4-4 4H10q-4 0-4-4Z' />
          <path d='M9 21h16l3 16q0 4-4 4H10q-4 0-4-4ZM25 23h3a5 5 0 0 1 0 10h-1M9 23l-6-3 4 11M12 18h10M17 15v3M4 43h26M13 12q-4-3 0-6M21 12q-4-3 0-6' />
        </>
      ) : kind === 'entry' ? (
        <>
          <path className='canvas-room-artwork__wash' d='M5 8h17v34H5Z' />
          <path d='M5 42V8h17v34M3 42h30M9 12h9v13H9M17 29h1' />
          <rect className='canvas-room-artwork__wash' x='21' y='25' width='13' height='17' rx='2' />
          <rect x='21' y='25' width='13' height='17' rx='2' />
          <circle cx='27.5' cy='35' r='3.5' />
          <path d='M24 28h3' />
        </>
      ) : kind === 'bathroom' ? (
        <>
          <path className='canvas-room-artwork__solid' d='M26 3s-4 5-4 8a4 4 0 0 0 8 0c0-3-4-8-4-8Z' />
          <path className='canvas-room-artwork__wash' d='M4 29h28q-2 9-14 9T4 29Z' />
          <path d='M4 29h28q-2 9-14 9T4 29ZM11 28v-8a4 4 0 0 1 8 0v2M15 38v5h6v-5M4 26h28' />
        </>
      ) : (
        <>
          <path className='canvas-room-artwork__wash' d='m4 23 14-13 14 13v19H4Z' />
          <path d='m2 24 16-15 16 15M5 22v20h26V22M14 42V29h8v13' />
        </>
      )}
    </svg>
  );
}
