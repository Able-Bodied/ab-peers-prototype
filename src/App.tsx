import { Navigate, Route, Routes } from 'react-router-dom';

import { AppNav } from '@/components/app-nav';
import { DismissalsProvider } from '@/lib/dismissals';
import { FollowsProvider } from '@/lib/follows';
import { RsvpProvider } from '@/lib/rsvps';
import { SessionProvider, useSession } from '@/lib/session';
import ConnectPage from '@/routes/connect/page';
import CoordinatorPage from '@/routes/coordinator/page';
import EventPage from '@/routes/event/page';
import EventsPage from '@/routes/events/page';
import MapPage from '@/routes/map/page';
import OnboardingPage from '@/routes/onboarding/page';
import ProfilePage from '@/routes/profile/page';

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
            <div className="flex min-h-svh flex-col md:flex-row">
              <AppNav />
              {/* Bottom padding clears the floating tab bar, which overlays the page on mobile. */}
              <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-28 md:p-8">
                <Routes>
                  <Route path="/" element={<RootRedirect />} />
                  <Route path="/onboarding" element={<OnboardingPage />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/connect" element={<ConnectPage />} />
                  <Route path="/coordinator" element={<CoordinatorPage />} />
                  <Route path="/events" element={<EventsPage />} />
                  <Route path="/event/:id" element={<EventPage />} />
                </Routes>
              </main>
            </div>
          </DismissalsProvider>
        </FollowsProvider>
      </RsvpProvider>
    </SessionProvider>
  );
}
