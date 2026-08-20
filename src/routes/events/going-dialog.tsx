import { CalendarPlus, ExternalLink, Ticket } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildIcsFile, type IcsEventInput, icsFilename } from '@/lib/ics';

/**
 * What someone sees after marking an event Going.
 *
 * Marking Going here does not reserve them a place: these events belong to partner organizations
 * that each run their own registration, and this app has no way to book on their behalf. So the
 * dialog is explicit that there is a second step, and hands over the two things that actually get
 * them there — a calendar entry, and the organizer's own registration page.
 */

interface GoingDialogProps {
  open: boolean;
  onClose: () => void;
  event: IcsEventInput;
}

export function GoingDialog({ open, onClose, event }: GoingDialogProps) {
  const [download, setDownload] = useState<{ url: string; filename: string } | null>(null);

  // The blob URL is built in an effect rather than during render so that each cleanup revokes the
  // exact URL its own run created. Creating it in a memo and revoking through a ref would revoke
  // whatever the ref points at by then, which after a re-render is the new URL, not the old one.
  useEffect(() => {
    if (!open) {
      setDownload(null);
      return;
    }

    let url: string | null = null;
    try {
      const blob = new Blob([buildIcsFile(event)], { type: 'text/calendar;charset=utf-8' });
      url = URL.createObjectURL(blob);
      setDownload({ url, filename: icsFilename(event.title) });
    } catch {
      // An event whose start time the feed mangled still deserves the links below, so the calendar
      // row drops out rather than taking the whole dialog down with it.
      setDownload(null);
    }

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [open, event]);

  const registrationUrl = trimmedOrNull(event.registrationUrl);
  const eventUrl = trimmedOrNull(event.url);
  // Only worth its own row when it is a different destination from the registration link.
  const detailsUrl = eventUrl && eventUrl !== registrationUrl ? eventUrl : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>You&rsquo;re marked as going</DialogTitle>
          <DialogDescription>
            {registrationUrl
              ? 'The host runs their own registration, so finish signing up with them to secure your place.'
              : 'The host runs their own sign-ups. Check their event page for anything else they need from you.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {download && (
            <a
              href={download.url}
              download={download.filename}
              className="hover:bg-secondary flex items-start gap-3 rounded-xl border-2 p-3 text-left"
            >
              <CalendarPlus className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[15px] font-bold">Add to your calendar</span>
                <span className="text-muted-foreground block text-[13px] leading-snug">
                  Downloads a calendar file linking back to the host&rsquo;s event page.
                </span>
              </span>
            </a>
          )}

          {registrationUrl && (
            <a
              href={registrationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border-primary bg-primary text-primary-foreground flex items-start gap-3 rounded-xl border-2 p-3 text-left"
            >
              <Ticket className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[15px] font-bold">
                  Register with the host
                  <ExternalLink className="ml-1.5 inline size-3.5" aria-hidden="true" />
                </span>
                <span className="block text-[13px] leading-snug opacity-90">
                  Opens {hostOf(registrationUrl)} in a new tab.
                </span>
              </span>
            </a>
          )}

          {detailsUrl && (
            <a
              href={detailsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-secondary flex items-start gap-3 rounded-xl border-2 p-3 text-left"
            >
              <ExternalLink className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[15px] font-bold">See the full details</span>
                <span className="text-muted-foreground block text-[13px] leading-snug">
                  Opens {hostOf(detailsUrl)} in a new tab.
                </span>
              </span>
            </a>
          )}

          {!download && !registrationUrl && !detailsUrl && (
            <p className="text-muted-foreground text-sm">
              This listing didn&rsquo;t come with a registration link or a page to send you to.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="bg-secondary text-primary min-h-11 rounded-xl px-6 font-bold"
        >
          Done
        </button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Feeds routinely emit an empty string rather than omitting a field, so blank-but-present has to
 * count as absent — otherwise the dialog offers a link that goes nowhere.
 */
function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  // Not `?? null`: that keeps an empty string, which is exactly the case this exists to catch.
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

/** Bare hostname, so the row can say where the link goes before someone commits to the tap. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'the host site';
  }
}
