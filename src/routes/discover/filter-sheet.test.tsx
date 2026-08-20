import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MEMBERS, ORGS } from '@/mocks/seed';
import { DiscoverFilterSheet, type DiscoverFilterSheetProps } from '@/routes/discover/filter-sheet';
import { defaultDiscoverFilters, languagesIn, topicsIn } from '@/routes/discover/filters';
import type { BrowseMember, MemberFilters } from '@/types/domain';

/** The seeded people, cut to what another member may see (docs/PII.md). No invented humans. */
const browsable: BrowseMember[] = MEMBERS.map(
  ({ phone: _phone, birthDate: _birthDate, ...rest }) => rest,
);

const languages = languagesIn(browsable);
const topics = topicsIn(browsable);
const organizations = ORGS.slice(0, 3).map((org) => ({ slug: org.id, name: org.name }));

/**
 * The sheet is controlled, so the test holds the state the page would hold. The spy records what
 * the sheet asked for; the state makes the next render show the result, the way it will in the app.
 */
function renderSheet(
  overrides: Partial<DiscoverFilterSheetProps> = {},
  initial: MemberFilters = defaultDiscoverFilters,
) {
  const onChange = vi.fn();
  const onOpenChange = vi.fn();

  function Harness() {
    const [filters, setFilters] = useState<MemberFilters>(initial);
    return (
      <DiscoverFilterSheet
        open
        onOpenChange={onOpenChange}
        filters={filters}
        onChange={(next) => {
          onChange(next);
          setFilters(next);
        }}
        organizations={organizations}
        languages={languages}
        topics={topics}
        resultCount={12}
        {...overrides}
      />
    );
  }

  render(<Harness />);
  return { onChange, onOpenChange, user: userEvent.setup() };
}

describe('DiscoverFilterSheet', () => {
  it('is announced as a dialog called Filters', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: /filters/i })).toBeInTheDocument();
  });

  it('offers the sections behind the Filters button, in the order the PRD ranks them', () => {
    renderSheet();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'State',
      'Disability',
      'Equipment',
      'Organization',
      'Level',
      'Time since disability',
      'Languages',
      'Topics',
      'Age band',
    ]);
  });

  it('narrows by state or disability from inside the sheet', async () => {
    const { onChange, user } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Texas' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'Texas', disability: 'All' }),
    );

    await user.click(screen.getByRole('button', { name: 'SCI - para' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'Texas', disability: 'SCI - para' }),
    );

    await user.click(screen.getByRole('button', { name: 'All states' }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'All', disability: 'SCI - para' }),
    );
  });

  it('sends the whole next filter object when a filter is picked', async () => {
    const { onChange, user } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Power chair' }));

    expect(onChange).toHaveBeenCalledWith({
      state: 'All',
      disability: 'All',
      equipment: 'Power chair',
    });
  });

  it('shows the picked filter as pressed', async () => {
    const { user } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Power chair' }));

    expect(screen.getByRole('button', { name: 'Power chair' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All equipment' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('clears a filter when its chip is tapped again', async () => {
    const { onChange, user } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Power chair' }));
    await user.click(screen.getByRole('button', { name: 'Power chair' }));

    expect(onChange).toHaveBeenLastCalledWith({
      state: 'All',
      disability: 'All',
      equipment: undefined,
    });
  });

  it('files an organization under its slug while showing its name', async () => {
    const { onChange, user } = renderSheet();
    const org = organizations[0];

    await user.click(screen.getByRole('button', { name: org?.name ?? '' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ orgId: org?.slug }));
  });

  it('shows how many filters are narrowing the deck', async () => {
    const { user } = renderSheet();
    expect(screen.getByText('No filters yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Power chair' }));
    expect(screen.getByText('1 filter active')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '30-39' }));
    expect(screen.getByText('2 filters active')).toBeInTheDocument();
  });

  it('disables Clear all until something is actually narrowing', async () => {
    const { user } = renderSheet();
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Manual chair' }));
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeEnabled();
  });

  it('resets every filter with Clear all', async () => {
    const { onChange, user } = renderSheet(
      {},
      {
        state: 'California',
        disability: 'SCI - quad',
        equipment: 'Power chair',
        level: 'C5',
        ageBand: '30-39',
      },
    );
    expect(screen.getByText('5 filters active')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(onChange).toHaveBeenCalledWith({ state: 'All', disability: 'All' });
    expect(screen.getByText('No filters yet')).toBeInTheDocument();
  });

  it('shows the live result count on the apply button', () => {
    renderSheet({ resultCount: 7 });
    expect(screen.getByRole('button', { name: 'Show 7 people' })).toBeInTheDocument();
    expect(screen.getByText('7 people match these filters.')).toBeInTheDocument();
  });

  it('says so before someone filters down to nobody', () => {
    renderSheet({ resultCount: 0 });
    expect(
      screen.getByText('Nobody matches these filters — clear one to see people again.'),
    ).toBeInTheDocument();
  });

  it('closes on the apply button without changing the filters', async () => {
    const { onChange, onOpenChange, user } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Show 12 people' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes on the close button and on Escape', async () => {
    const { onOpenChange, user } = renderSheet();

    await user.click(screen.getByRole('button', { name: 'Close filters' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledTimes(2);
  });

  it('is operable from the keyboard alone', async () => {
    const { onChange, user } = renderSheet();

    screen.getByRole('button', { name: 'Manual chair' }).focus();
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ equipment: 'Manual chair' }));
  });

  describe('level', () => {
    it('is disabled while the disability filter is not an SCI or Combo type', () => {
      renderSheet({}, { state: 'All', disability: 'Amputee' });

      expect(screen.getByLabelText('Level of injury')).toBeDisabled();
      expect(
        screen.getByText(
          'Level applies to spinal cord injuries. Pick SCI - para, SCI - quad or Combo for Disability above to filter by it.',
        ),
      ).toBeInTheDocument();
    });

    it('is disabled while the disability filter is still All', () => {
      renderSheet();
      expect(screen.getByLabelText('Level of injury')).toBeDisabled();
    });

    it('is usable once the disability is SCI', async () => {
      const { onChange, user } = renderSheet({}, { state: 'All', disability: 'SCI - quad' });
      const select = screen.getByLabelText('Level of injury');
      expect(select).toBeEnabled();

      await user.selectOptions(select, 'C5');

      expect(onChange).toHaveBeenCalledWith({
        state: 'All',
        disability: 'SCI - quad',
        level: 'C5',
      });
    });

    it('goes back to any level', async () => {
      const { onChange, user } = renderSheet(
        {},
        { state: 'All', disability: 'SCI - para', level: 'T6' },
      );

      await user.selectOptions(screen.getByLabelText('Level of injury'), 'Any level');

      expect(onChange).toHaveBeenLastCalledWith({
        state: 'All',
        disability: 'SCI - para',
        level: undefined,
      });
    });
  });

  describe('vocabulary', () => {
    it('offers only the languages someone in the loaded set speaks', () => {
      renderSheet({ languages: ['ASL', 'English'] });

      expect(screen.getByRole('button', { name: 'ASL' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Mandarin' })).not.toBeInTheDocument();
    });

    it('offers only topics somebody here will discuss, so no chip is a dead end', () => {
      renderSheet({ topics: ['Transfers'] });

      expect(screen.getByRole('button', { name: 'Transfers' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Botox' })).not.toBeInTheDocument();
    });

    it('says so rather than showing an empty section when nobody has listed a language', () => {
      renderSheet({ languages: [] });
      expect(screen.getByText('Nobody in this set has listed a language yet.')).toBeInTheDocument();
    });

    it('does not offer "Prefer not to say" as something to browse for', () => {
      renderSheet();
      expect(screen.queryByRole('button', { name: 'Prefer not to say' })).not.toBeInTheDocument();
    });
  });
});
