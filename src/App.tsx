import { Navigate, NavLink, Route, Routes } from 'react-router-dom';

import { DismissalsProvider } from '@/lib/dismissals';
import { FollowsProvider } from '@/lib/follows';
import { RsvpProvider } from '@/lib/rsvps';
import { SessionProvider, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { WavesProvider } from '@/lib/waves';
import ConnectPage from '@/routes/connect/page';
import CoordinatorPage from '@/routes/coordinator/page';
import DevLoginPage from '@/routes/dev-login/page';
import DiscoverPage from '@/routes/discover/page';
import EventPage from '@/routes/event/page';
import EventsPage from '@/routes/events/page';
import MapPage from '@/routes/map/page';
import OnboardingPage from '@/routes/onboarding/page';
import ProfilePage from '@/routes/profile/page';

interface Flow {
  to: string;
  label: string;
  description: string;
}

// The 5 MVP flows from docs/CONTEXT.md, in priority order.
const flows: Flow[] = [
  { to: '/onboarding', label: 'Onboarding', description: 'Wizard for new peers/mentors' },
  { to: '/discover', label: 'Discover', description: 'Browse peers and mentors' },
  { to: '/map', label: 'Mentor Map', description: 'Filterable map of peers and mentors' },
  { to: '/profile', label: 'Profile', description: 'Single peer/mentor profile' },
  { to: '/connect', label: 'Connect', description: 'Message or reveal-contact action' },
  { to: '/coordinator', label: 'Coordinator Dashboard', description: 'Roster + PII + touchpoints' },
  { to: '/events', label: 'Events', description: 'Discover adaptive sports & peer events' },
];

function RootRedirect() {
  const { member, loading } = useSession();
  if (loading) return null;
  return <Navigate to={member ? '/discover' : '/onboarding'} replace />;
}

export function App() {
  return (
    <SessionProvider>
      <RsvpProvider>
        <FollowsProvider>
          <DismissalsProvider>
            <WavesProvider>
              <div className="flex min-h-svh flex-col md:flex-row">
                {/* Dev-only flow switcher — not part of the product, so it doesn't need to exist
                on a phone-sized viewport. Mobile shows the routed page full-screen, matching the
                mockups. */}
                <aside className="hidden w-64 shrink-0 border-r px-4 py-6 md:block">
                  <div className="mb-6 px-2">
                    <p className="text-sm font-semibold">AbleBodied</p>
                    <p className="text-muted-foreground text-xs">
                      Peer mentor matching — prototype
                    </p>
                  </div>
                  <nav className="flex flex-col gap-1" aria-label="Prototype flows">
                    {flows.map((flow) => (
                      <NavLink
                        key={flow.to}
                        to={flow.to}
                        className={({ isActive }) =>
                          cn(
                            'rounded-md px-2 py-1.5 text-sm transition-colors',
                            isActive
                              ? 'bg-accent text-accent-foreground font-medium'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          )
                        }
                      >
                        <span className="block">{flow.label}</span>
                        <span className="text-muted-foreground block text-xs">
                          {flow.description}
                        </span>
                      </NavLink>
                    ))}
                  </nav>
                </aside>
                <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
                  <Routes>
                    <Route path="/" element={<RootRedirect />} />
                    {/* Unlisted — not in `flows`, so it never shows in the sidebar. See
                    src/routes/dev-login/page.tsx and AGENTS.md for the test user it logs in. */}
                    <Route path="/dev-login" element={<DevLoginPage />} />
                    <Route path="/onboarding" element={<OnboardingPage />} />
                    <Route path="/discover" element={<DiscoverPage />} />
                    <Route path="/map" element={<MapPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/connect" element={<ConnectPage />} />
                    <Route path="/coordinator" element={<CoordinatorPage />} />
                    <Route path="/events" element={<EventsPage />} />
                    <Route path="/event/:id" element={<EventPage />} />
                  </Routes>
                </main>
              </div>
            </WavesProvider>
          </DismissalsProvider>
        </FollowsProvider>
      </RsvpProvider>
    </SessionProvider>
  );
}
