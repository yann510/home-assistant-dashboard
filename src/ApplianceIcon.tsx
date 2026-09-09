type Kind = 'washer' | 'dryer' | 'dishwasher';
export type ApplianceIconState = 'running' | 'paused' | 'idle' | 'unavailable' | 'unknown';
export function ApplianceIcon({ kind, state }: { kind: Kind; state: ApplianceIconState }) {
  return (
    <svg
      className={`appliance-status-icon ${kind}`}
      data-state={state}
      viewBox='0 0 32 32'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.6'
      strokeLinecap='round'
      strokeLinejoin='round'
      aria-hidden='true'
    >
      <rect x='5' y='2.5' width='22' height='27' rx='3' />
      <path d='M5 9h22M9 6h3' />
      <circle cx='23' cy='6' r='.8' fill='currentColor' stroke='none' />
      {kind === 'dishwasher' ? (
        <>
          <path d='M9 24h14M10 19v5m4-5v5m4-5v5m4-5v5' />
          <g className='appliance-spray'>
            <path d='m11 12-1 3m6-3v3m5-3 1 3' />
          </g>
          <g className='appliance-spray appliance-spray-second'>
            <path d='m12 14-1 3m5-3v3m4-3 1 3' />
          </g>
        </>
      ) : (
        <>
          <circle cx='16' cy='19' r='7' />
          <g className='appliance-drum'>
            {kind === 'washer' ? (
              <>
                <path d='M12 15.5c1.5-1.5 4-1.5 5.5 0M20 19c0 2-1.5 3.5-3.5 4M12.5 22c-1.3-1-1.7-2.5-1.2-4' />
              </>
            ) : (
              <>
                <path d='M12 17c2-2 3 2 5 0s3 0 3 2-2 3-4 2-3 1-4-1z' />
                <path d='M15 14.5h2' />
              </>
            )}
          </g>
        </>
      )}
    </svg>
  );
}
