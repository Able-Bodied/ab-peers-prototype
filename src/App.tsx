import { Navigate, Route, Routes } from 'react-router-dom';

import { AppNav } from '@/components/app-nav';
import { RequireSession } from '@/components/require-session';
import { ChatProvider } from '@/lib/chat';
import { DismissalsProvider } from '@/lib/dismissals';
import { FollowsProvider } from '@/lib/follows';
import { RsvpProvider } from '@/lib/rsvps';
import { SessionProvider, useSession } from '@/lib/session';
import ActivityPage from '@/routes/activity/page';
import ConnectPage from '@/routes/connect/page';
import CoordinatorPage from '@/routes/coordinator/page';
import DevLoginPage from '@/routes/dev-login/page';
import DiscoverPage from '@/routes/discover/page';
import EventPage from '@/routes/event/page';
import EventsPage from '@/routes/events/page';
import MapPage from '@/routes/map/page';
import MessagesPage from '@/routes/messages/page';
import OnboardingPage from '@/routes/onboarding/page';
import ProfileEditPage from '@/routes/profile/edit/page';
import ProfilePage from '@/routes/profile/page';

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
            {/* Chat sits inside the session provider because every read it makes is
            keyed on the signed-in member — see src/lib/chat.tsx. */}
            <ChatProvider>
              <div className="flex min-h-svh flex-col md:flex-row">
                <AppNav />
                {/* Bottom padding clears the floating tab bar, which overlays the page on mobile. */}
                <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-28 md:p-8">
                  <Routes>
                    <Route path="/" element={<RootRedirect />} />
                    {/* Unlisted — not in AppNav's navItems, so it never shows in the nav. See
                    src/routes/dev-login/page.tsx and AGENTS.md for the test user it logs in. */}
                    <Route path="/dev-login" element={<DevLoginPage />} />
                    <Route path="/onboarding" element={<OnboardingPage />} />
                    <Route
                      path="/discover"
                      element={
                        <RequireSession>
                          <DiscoverPage />
                        </RequireSession>
                      }
                    />
                    <Route
                      path="/map"
                      element={
                        <RequireSession>
                          <MapPage />
                        </RequireSession>
                      }
                    />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/profile/edit" element={<ProfileEditPage />} />
                    <Route
                      path="/connect"
                      element={
                        <RequireSession>
                          <ConnectPage />
                        </RequireSession>
                      }
                    />
                    {/* One component serves both: the inbox, and the inbox with a
                    thread open beside it. See src/routes/messages/page.tsx. */}
                    <Route
                      path="/messages"
                      element={
                        <RequireSession>
                          <MessagesPage />
                        </RequireSession>
                      }
                    />
                    <Route
                      path="/messages/:conversationId"
                      element={
                        <RequireSession>
                          <MessagesPage />
                        </RequireSession>
                      }
                    />
                    <Route
                      path="/coordinator"
                      element={
                        <RequireSession>
                          <CoordinatorPage />
                        </RequireSession>
                      }
                    />
                    <Route
                      path="/events"
                      element={
                        <RequireSession>
                          <EventsPage />
                        </RequireSession>
                      }
                    />
                    <Route
                      path="/activity"
                      element={
                        <RequireSession>
                          <ActivityPage />
                        </RequireSession>
                      }
                    />
                    <Route
                      path="/event/:id"
                      element={
                        <RequireSession>
                          <EventPage />
                        </RequireSession>
                      }
                    />
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
