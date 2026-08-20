import type { LucideIcon } from 'lucide-react';
import { Sparkles, UserRound } from 'lucide-react';
import type { SVGProps } from 'react';
import { NavLink } from 'react-router-dom';

import { ActivityIcon, ChatsIcon, DiscoverIcon, EventsIcon } from '@/components/nav-icons';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * The app's primary navigation. One list of destinations, two shapes: a labelled sidebar on a
 * desktop viewport, collapsing below `md` into the floating pill tab bar from the mockups
 * (docs/screens/events-screen.html) — paper card, rounded, icon over a short label, active tab in
 * pine. It's a single <nav> reshaped with responsive classes rather than two rendered navs, so a
 * destination can't exist on one surface and go missing on the other.
 *
 * Tab labels are the product-facing names a peer reads (Discover, Chats, Me), not the internal
 * flow names from docs/CONTEXT.md — the route paths still carry those, and the sidebar's second
 * line keeps the flow description around for whoever opens the prototype cold.
 */
export interface NavItem {
  to: string;
  /** Short label — sized for a six-up tab bar at 390px. */
  label: string;
  /** Sidebar-only second line: what this flow is. Hidden in the tab bar. */
  description: string;
  icon: LucideIcon | ((props: SVGProps<SVGSVGElement>) => React.JSX.Element);
}

export const navItems: NavItem[] = [
  {
    to: '/discover',
    label: 'Discover',
    description: 'Browse and swipe through peers and mentors',
    icon: DiscoverIcon,
  },
  {
    to: '/events',
    label: 'Events',
    description: 'Adaptive sports & peer events',
    icon: EventsIcon,
  },
  { to: '/connect', label: 'Chats', description: 'Message or reveal contact', icon: ChatsIcon },
  {
    to: '/activity',
    label: 'Activity',
    description: 'Waves, replies & event reminders',
    icon: ActivityIcon,
  },
];

// The coordinator dashboard (docs/PRD.md's roster/upload flow) has no nav tab — Activity
// took its slot — but the route itself still resolves for anyone who links to it directly.
// Same for the old filterable-map placeholder at /map: Discover now points at the real
// browse/swipe feature (src/routes/discover), so /map is unlinked but still reachable.

// The last tab is one slot shared by two destinations: a signed-out visitor gets the
// join/sign-in wizard, a signed-in member gets their own profile. They never both apply,
// so it's one tab that swaps identity rather than two tabs where one hides.
const joinItem: NavItem = {
  to: '/onboarding',
  label: 'Join',
  description: 'Wizard for new peers/mentors',
  icon: Sparkles,
};
const profileItem: NavItem = {
  to: '/profile',
  label: 'Me',
  description: 'Your peer/mentor profile',
  icon: UserRound,
};

export function AppNav() {
  const { member } = useSession();
  const items = [...navItems, member ? profileItem : joinItem];

  return (
    <nav
      aria-label="Main"
      className={cn(
        // Phone: floating pill bar pinned above the home indicator.
        'bg-card fixed inset-x-3 bottom-3 z-40 flex rounded-3xl border px-1 py-2 shadow-lg',
        'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        // Desktop: back in flow as a sidebar column.
        'md:static md:w-64 md:shrink-0 md:flex-col md:gap-1 md:rounded-none md:border-0 md:border-r',
        'md:px-4 md:py-6 md:pb-6 md:shadow-none',
      )}
    >
      <div className="mb-6 hidden px-2 md:block">
        <p className="text-sm font-semibold">AbleBodied</p>
        <p className="text-muted-foreground text-xs">Peer mentor matching — prototype</p>
      </div>

      {items.map(({ to, label, description, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'group flex flex-1 flex-col items-center gap-1 px-0.5 py-1 text-[10.5px] font-bold transition-colors',
              'md:flex-none md:flex-row md:items-start md:gap-2.5 md:rounded-md md:px-2 md:py-1.5',
              'md:text-sm md:font-normal',
              isActive
                ? 'text-primary md:bg-primary/10 md:font-medium'
                : 'text-muted-foreground md:hover:bg-primary/5 md:hover:text-foreground',
            )
          }
        >
          {/* Tinted chip marks the current tab by more than colour alone; the sidebar's filled
              row already does that job at md and up, so it's phone-only. */}
          <span
            className={cn(
              'flex items-center justify-center rounded-full px-3 py-0.5 transition-colors md:contents',
              'group-aria-[current=page]:bg-primary/10',
            )}
          >
            <Icon aria-hidden="true" className="size-[22px] shrink-0 md:mt-0.5 md:size-4" />
          </span>
          <span className="min-w-0">
            <span className="block">{label}</span>
            <span className="text-muted-foreground hidden text-xs md:block">{description}</span>
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
