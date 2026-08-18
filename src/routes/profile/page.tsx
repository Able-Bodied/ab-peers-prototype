import { Link, useNavigate } from 'react-router-dom';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '@/lib/session';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('');
}

export default function ProfilePage() {
  const { member, loading, signOut, deleteMember } = useSession();
  const navigate = useNavigate();

  async function handleDeleteProfile() {
    if (!confirm('Delete your profile and go through onboarding again?')) return;
    await deleteMember();
    void navigate('/onboarding', { replace: true });
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading your profile…</p>;
  }

  if (!member) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          This is where a signed-in member's own profile lives, pulled from the real Supabase
          backend. You're not signed in.
        </p>
        <Button asChild className="mt-4">
          <Link to="/onboarding">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Your own profile, pulled live from the <code>members</code> table.
      </p>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-start gap-4">
          <Avatar className="size-16">
            {member.photoUrl && <AvatarImage src={member.photoUrl} alt="" />}
            <AvatarFallback className="text-lg">{initials(member.displayName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-xl">{member.displayName}</CardTitle>
            <p className="text-muted-foreground text-sm">
              {member.city}, {member.state}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{member.type === 'mentor' ? 'Mentor' : 'Peer'}</Badge>
              <Badge variant="outline">{member.disability}</Badge>
              {member.level ? <Badge variant="outline">{member.level}</Badge> : null}
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void signOut();
            }}
          >
            Log out
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Age range</dt>
            <dd>{member.ageBand}</dd>
            <dt className="text-muted-foreground">Time since injury</dt>
            <dd>{member.duration}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {member.interests.map((interest) => (
              <Badge key={interest} variant="secondary" className="font-normal">
                {interest}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-center justify-between rounded-lg border border-dashed px-4 py-3">
        <p className="text-muted-foreground text-xs">
          Dev/testing only: deletes your <code>members</code> row so you can go through onboarding
          again with the same phone number.
        </p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            void handleDeleteProfile();
          }}
        >
          Delete profile
        </Button>
      </div>

      {/* TODO(team): Profile page acceptance criteria
        - [x] Show the signed-in member's own real profile (this component).
        - [ ] "Delete profile" is a dev/testing convenience for re-running onboarding against one
              phone number — remove it (and the delete RLS policy) once real accounts matter.
        - [ ] Viewing *another* mentor/peer's profile (reached from a map pin) is a separate,
              still-unbuilt feature — will need a route param (e.g. /profile/:id) and a lookup
              against real data, not mock seed data.
        - [ ] Connect button opens /connect (or a modal) scoped to a specific other mentor, once
              that flow exists.
        - [ ] Respect privacy settings once they exist: some fields (exact contact info) may be
              hidden until a connection is accepted — never show raw contact data by default.
        - [ ] Richer profile fields (bio, languages, affiliations, topics, mentoring capacity)
              aren't collected by the onboarding wizard yet — this page only shows what's
              actually in the members table until that exists.
      */}
    </div>
  );
}
