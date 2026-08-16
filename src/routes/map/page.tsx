import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mentors } from '@/mocks/seed';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('');
}

export default function MapPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Mentor Map</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        The filterable map of mentors and peers is the main discovery surface: filter by disability,
        mentor vs. peer, and interests, then click a pin to open that person's profile. This is how
        a mentee finds a mentor without waiting on a coordinator introduction.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="filter-injury">Disability</Label>
              <Select>
                <SelectTrigger id="filter-injury" className="w-full">
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SCI">SCI</SelectItem>
                  <SelectItem value="TBI">TBI</SelectItem>
                  <SelectItem value="SCI+TBI">SCI+TBI</SelectItem>
                  <SelectItem value="stroke">Stroke</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="filter-role">Role</Label>
              <Select>
                <SelectTrigger id="filter-role" className="w-full">
                  <SelectValue placeholder="Mentors and peers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mentor">Mentors only</SelectItem>
                  <SelectItem value="peer">Peers only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Interests</Label>
              <div className="flex flex-wrap gap-1.5">
                {['hand cycling', 'parenting after injury', 'travel', 'returning to work'].map(
                  (interest) => (
                    <Badge key={interest} variant="outline" className="cursor-pointer font-normal">
                      {interest}
                    </Badge>
                  ),
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <div className="bg-muted text-muted-foreground flex h-72 items-center justify-center rounded-lg border text-sm">
            Map placeholder — see TODO below for library choice.
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {mentors.map((mentor) => (
              <Card key={mentor.id}>
                <CardContent className="flex items-start gap-3">
                  <Avatar>
                    <AvatarFallback>{initials(mentor.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{mentor.displayName}</p>
                    <p className="text-muted-foreground text-xs">
                      {mentor.location.city}, {mentor.location.state} · {mentor.injuryType}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {mentor.topics.slice(0, 2).map((topic) => (
                        <Badge key={topic} variant="secondary" className="font-normal">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* TODO(team): Mentor map acceptance criteria
        - [ ] Pick a map library: Leaflet + OpenStreetMap tiles or MapLibre GL are the two
              key-free options the team scoped (no Google Maps API key to manage for a
              hackathon). Wire it into the placeholder div above.
        - [ ] Pins render at city-center granularity only — never a precise address
              (see docs/PII.md and Location in src/types/domain.ts).
        - [ ] Filter sidebar actually filters the pin set and the card list below it, driven by
              local component state (no backend).
        - [ ] Clicking a pin or a card opens /profile for that mentor (pass an id, e.g. via
              route state or a query param — team's call).
        - [ ] Cluster pins when many mentors share a city center so the map doesn't look like a
              single dot per city.
      */}
    </div>
  );
}
