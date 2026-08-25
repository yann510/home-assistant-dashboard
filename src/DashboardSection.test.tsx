// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardSection } from './DashboardSection.tsx';

describe('DashboardSection', () => {
  it('keeps its cards mounted while collapsed so their Home Assistant state stays subscribed', () => {
    render(
      <DashboardSection title='Lights' defaultOpen>
        <button type='button'>Kitchen light</button>
      </DashboardSection>
    );

    fireEvent.click(screen.getByRole('button', { name: /lights/i }));

    const lightCard = screen.queryByRole('button', { name: 'Kitchen light', hidden: true });

    expect(lightCard).not.toBeNull();
    expect(lightCard?.parentElement?.hasAttribute('hidden')).toBe(true);
  });
});
