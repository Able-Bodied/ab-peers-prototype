import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const steps = ['Basics', 'Injury info', 'Location', 'Interests'];

export default function OnboardingPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Onboarding</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        A short, CareCure-style wizard for new peers and mentors: a handful of questions covering
        disability info, location, and the basics — nothing more. This is the front door for mentees
        finding a mentor via the map or a coordinator introduction, so it has to stay fast to
        complete.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Step 1 of {steps.length}: Basics</CardTitle>
          <CardDescription>
            Skeleton only — no validation or step navigation wired up yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex gap-2">
            {steps.map((step, index) => (
              <span
                key={step}
                className="text-muted-foreground flex-1 rounded-full border px-2 py-1 text-center text-xs first:font-medium first:text-foreground"
                data-step-index={index}
              >
                {step}
              </span>
            ))}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" placeholder="e.g. Jordan Rivera" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="injury-type">Injury type</Label>
            <Select>
              <SelectTrigger id="injury-type" className="w-full">
                <SelectValue placeholder="Select an injury type" />
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
            <Label htmlFor="location">Location</Label>
            <Input id="location" placeholder="Start typing a city…" />
            <p className="text-muted-foreground text-xs">
              Typeahead against a city dataset — see TODO below.
            </p>
          </div>

          <Button className="mt-2 w-full" disabled>
            Continue
          </Button>
        </CardContent>
      </Card>

      {/* TODO(team): Onboarding wizard acceptance criteria
        - [ ] Multi-step wizard with back/forward and a visible progress indicator.
        - [ ] Minimal required fields only: display name, injury type, city, one or two
              interests. Everything else (bio, equipment, languages) is optional and can be
              filled in later from the profile.
        - [ ] Location field is a real typeahead (city + state), not free text — resolve to a
              Location (city-center lat/lng) from src/types/domain.ts, never street address.
        - [ ] Mentor path (invite/training-gated) vs. mentee path fork after step 1; mentors get
              the richer profile survey mentioned in docs/CONTEXT.md, mentees don't.
        - [ ] Mobile-first layout; this is often filled out from a hospital bed or phone.
        - [ ] On submit, wire to whatever mock "create peer" action the team lands on — no
              network calls, just local state / mocks for the prototype.
        - [ ] No real personal data ever enters this form during dev/demo — see docs/PII.md.
      */}
    </div>
  );
}
