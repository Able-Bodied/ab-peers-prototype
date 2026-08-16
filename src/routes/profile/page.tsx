import { Link } from 'react-router-dom';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mentors } from '@/mocks/seed';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('');
}

export default function ProfilePage() {
  // Stub always renders the first seed mentor. Real route should read an id
  // (from the map pin/card click) and look it up in src/mocks/seed.ts.
  const mentor = mentors[0];

  if (!mentor) {
    return <p className="text-muted-foreground text-sm">No mentor found.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        The profile page is where a map popup or search result lands: full details on one mentor or
        peer, and the connect action (message, or reveal contact info depending on that person's
        privacy settings) lives here too.
      </p>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-start gap-4">
          <Avatar className="size-16">
            <AvatarFallback className="text-lg">{initials(mentor.displayName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-xl">
              {mentor.displayName}
              {mentor.pronouns ? (
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  ({mentor.pronouns})
                </span>
              ) : null}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {mentor.location.city}, {mentor.location.state}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{mentor.role}</Badge>
              <Badge variant="outline">{mentor.injuryType}</Badge>
              {mentor.injuryLevel ? <Badge variant="outline">{mentor.injuryLevel}</Badge> : null}
            </div>
          </div>
          <Button asChild>
            <Link to="/connect">Connect</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="about">
            <TabsList>
              <TabsTrigger value="about">About</TabsTrigger>
              <TabsTrigger value="topics">Mentoring topics</TabsTrigger>
            </TabsList>
            <TabsContent value="about" className="text-sm">
              <p>{mentor.bio}</p>
              <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Years post-injury</dt>
                <dd>{mentor.yearsPostInjury ?? '—'}</dd>
                <dt className="text-muted-foreground">Languages</dt>
                <dd>{mentor.languages.join(', ')}</dd>
                <dt className="text-muted-foreground">Affiliations</dt>
                <dd>{mentor.affiliations.join(', ')}</dd>
              </dl>
            </TabsContent>
            <TabsContent value="topics">
              <div className="flex flex-wrap gap-1.5">
                {mentor.topics.map((topic) => (
                  <Badge key={topic} variant="secondary" className="font-normal">
                    {topic}
                  </Badge>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* TODO(team): Profile page acceptance criteria
        - [ ] Read a mentor/peer id from the route (e.g. /profile/:id) instead of hardcoding
              mentors[0]; look it up in src/mocks/seed.ts.
        - [ ] Connect button opens /connect (or a modal) scoped to this specific mentor.
        - [ ] Respect privacy settings once they exist: some fields (exact contact info) may be
              hidden until a connection is accepted — never show raw contact data by default.
        - [ ] Handle the "not found" state gracefully (already stubbed above).
        - [ ] Distinguish mentor profiles (topics, affiliations, capacity) from peer/mentee
              profiles, which are a subset of the same Peer shape without the Mentor fields.
      */}
    </div>
  );
}
