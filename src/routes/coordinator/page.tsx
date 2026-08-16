import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { coordinators, mentors, organizations } from '@/mocks/seed';

export default function CoordinatorPage() {
  const coordinator = coordinators[0];
  const organization = organizations.find((org) => org.id === coordinator?.organizationId);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Coordinator Dashboard</h1>
      <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
        Coordinators like Eric and Robert archetypes upload a mentor spreadsheet, which becomes
        structured mentor/peer entities here. Full PII is visible only to the uploading coordinator
        — everyone else sees the same de-identified view as the public map. This dashboard is also
        where last-contact touchpoints get tracked.
      </p>

      <div className="mt-6 flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
        <div>
          Signed in as <span className="font-medium">{coordinator?.displayName}</span>
          {organization ? (
            <span className="text-muted-foreground"> · {organization.name}</span>
          ) : null}
        </div>
        <Badge variant="outline">full PII visible to you only</Badge>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Upload mentor roster</CardTitle>
          <CardDescription>
            Drop a spreadsheet to create/update mentor and peer entities. Nothing here should ever
            be a real file during dev — see docs/PII.md.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm">
            <span>Drag a .csv or .xlsx file here, or</span>
            <Button variant="outline" size="sm" disabled>
              Browse files
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Roster</CardTitle>
          <CardDescription>Mock data — stands in for what an upload would produce.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Location</th>
                <th className="pb-2 pr-4 font-medium">Affiliations</th>
                <th className="pb-2 pr-4 font-medium">Mentee capacity</th>
                <th className="pb-2 font-medium">Last contact</th>
              </tr>
            </thead>
            <tbody>
              {mentors.map((mentor) => (
                <tr key={mentor.id} className="border-b last:border-0">
                  <td className="py-2 pr-4">{mentor.displayName}</td>
                  <td className="py-2 pr-4">
                    {mentor.location.city}, {mentor.location.state}
                  </td>
                  <td className="py-2 pr-4">{mentor.affiliations.join(', ')}</td>
                  <td className="py-2 pr-4">{mentor.menteeCapacity ?? '—'}</td>
                  <td className="text-muted-foreground py-2">not tracked yet</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* TODO(team): Coordinator dashboard acceptance criteria
        - [ ] Wire the dropzone to a mock parser that turns rows into Mentor/Peer records
              (src/types/domain.ts) — no real spreadsheet, ever, even for local dev/demo
              (see docs/PII.md).
        - [ ] PII visibility rule: full contact/location detail is visible only to the
              coordinator who uploaded that record; everyone else gets the same reduced view
              the public map shows.
        - [ ] Add a real "last contact" column backed by mock touchpoint data, with a quick
              action to log a new touchpoint.
        - [ ] Filter/search the roster (by name, org, topic) — this is the coordinator's
              day-to-day matching tool, not just a read-only table.
        - [ ] Introduce/match action: let the coordinator connect a specific mentee to a
              specific mentor, creating a Connection record.
      */}
    </div>
  );
}
