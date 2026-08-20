import type { AccountMember } from '@/lib/session';
import { EDIT_SECTIONS, type EditSection } from '@/routes/profile/edit/types';

function isSectionDone(member: AccountMember, section: EditSection['id']): boolean {
  switch (section) {
    case 'profilePhoto':
      return member.photoUrl !== null;
    case 'bio':
      return member.bio.trim().length > 0;
    case 'photos':
      return false; // computed separately — photo count isn't on AccountMember.
    case 'interests':
      return member.interests.length > 0;
    case 'mentor':
      return member.mentorInterest;
    case 'injury':
      // Always set once onboarded — this section is really "edit", not "to do".
      return true;
    case 'lifeNow':
      return (
        member.independence !== null ||
        member.relationshipStatus !== null ||
        member.children !== null ||
        member.employment !== null ||
        member.languages.length > 0
      );
    case 'askMeAbout':
      return member.topics.length > 0;
  }
}

export function ProfileEditHub({
  member,
  photoCount,
  onSelect,
}: {
  member: AccountMember;
  photoCount: number;
  onSelect: (section: EditSection['id']) => void;
}) {
  const doneCount = EDIT_SECTIONS.filter((s) =>
    s.id === 'photos' ? photoCount > 0 : isSectionDone(member, s.id),
  ).length;
  const percentComplete = Math.round((doneCount / EDIT_SECTIONS.length) * 100);

  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-primary text-sm font-semibold">PeerConnect</p>
          <p className="text-muted-foreground text-xs">{percentComplete}% complete</p>
        </div>
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Your profile</h1>
        <p className="text-muted-foreground text-sm">
          Do as much or as little as you like. Everything here is optional and editable.
        </p>
      </div>

      <div className="divide-y rounded-lg border">
        {EDIT_SECTIONS.map((section) => {
          const done = section.id === 'photos' ? photoCount > 0 : isSectionDone(member, section.id);
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                onSelect(section.id);
              }}
              className="hover:bg-accent flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors"
            >
              <span>
                <span className="block font-medium">{section.title}</span>
                <span className="text-muted-foreground block text-xs">{section.description}</span>
              </span>
              <span
                className={
                  done
                    ? 'bg-secondary text-primary shrink-0 rounded-full px-2.5 py-1 text-xs font-medium'
                    : 'bg-muted text-muted-foreground shrink-0 rounded-full px-2.5 py-1 text-xs font-medium'
                }
              >
                {section.id === 'photos' && photoCount > 0
                  ? `${photoCount} added`
                  : done
                    ? 'Done'
                    : 'To do'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
