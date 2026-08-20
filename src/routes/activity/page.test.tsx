import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ActivityPage from '@/routes/activity/page';

describe('ActivityPage', () => {
  it('shows a coming-soon note instead of a fake feed', () => {
    render(<ActivityPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
    expect(screen.getByText('This feature is coming soon.')).toBeInTheDocument();
  });
});
