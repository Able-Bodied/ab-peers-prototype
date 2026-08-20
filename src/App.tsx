import { Navigate, NavLink, Route, Routes } from 'react-router-dom';

import { ChatProvider } from '@/lib/chat';
import { DismissalsProvider } from '@/lib/dismissals';
import { FollowsProvider } from '@/lib/follows';
import { RsvpProvider } from '@/lib/rsvps';
import { SessionProvider, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import ConnectPage from '@/routes/connect/page';
import CoordinatorPage from '@/routes/coordinator/page';
import EventPage from '@/routes/event/page';
import EventsPage from '@/routes/events/page';
import MapPage from '@/routes/map/page';
import MessagesPage from '@/routes/messages/page';
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
  { to: '/map', label: 'Mentor Map', description: 'Filterable map of peers and mentors' },
  { to: '/profile', label: 'Profile', description: 'Single peer/mentor profile' },
  { to: '/connect', label: 'Connect', description: 'Say hi, or write the first message' },
  { to: '/messages', label: 'Messages', description: 'Waves inbox and conversations' },
  { to: '/coordinator', label: 'Coordinator Dashboard', description: 'Roster + PII + touchpoints' },
  { to: '/events', label: 'Events', description: 'Discover adaptive sports & peer events' },
];

function RootRedirect() {
  const { member, loading } = useSession();
  if (loading) return null;
  return <Navigate to={member ? '/profile' : '/onboarding'} replace />;
}

export function App() {
  return (
    <SessionProvider>
      <RsvpProvider>
        <FollowsProvider>
          <DismissalsProvider>
            {/* Chat sits inside the session provider because every read it makes is
            keyed on the signed-in member — see src/lib/chat.tsx. */}
            <ChatProvider>
              <div className="flex min-h-svh flex-col md:flex-row">
                {/* Dev-only flow switcher — not part of the product, so it doesn't need to exist on a
              phone-sized viewport. Mobile shows the routed page full-screen, matching the mockups. */}
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
                    <Route path="/onboarding" element={<OnboardingPage />} />
                    <Route path="/map" element={<MapPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/connect" element={<ConnectPage />} />
                    {/* One component serves both: the inbox, and the inbox with a
                  thread open beside it. See src/routes/messages/page.tsx. */}
                    <Route path="/messages" element={<MessagesPage />} />
                    <Route path="/messages/:conversationId" element={<MessagesPage />} />
                    <Route path="/coordinator" element={<CoordinatorPage />} />
                    <Route path="/events" element={<EventsPage />} />
                    <Route path="/event/:id" element={<EventPage />} />
                  </Routes>
                </main>
              </div>
            </ChatProvider>
          </DismissalsProvider>
        </FollowsProvider>
      </RsvpProvider>
    </SessionProvider>
  );
}
