import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { REPORT_REASONS, type ReportReason } from '@/types/domain';

/**
 * The two safety actions that need a moment of deliberation before they fire.
 *
 * Both are dialogs rather than menu items that act immediately, for opposite
 * reasons. Blocking is hard to notice you have done and quietly ends a
 * relationship, so it gets one sentence explaining what it actually does before
 * it happens. Reporting is the opposite problem: it goes to a human who has to
 * act on it, and a report with no reason attached is a report nobody can triage,
 * so it collects one before it will submit.
 */

/**
 * The stored `reason` values are database enum members, not sentences. Naming
 * them here keeps the enum stable while the words a member reads stay
 * changeable.
 */
const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment or abuse',
  spam: 'Spam or a scam',
  impersonation: 'Pretending to be someone else',
  safety: "Concern for someone's safety",
  other: 'Something else',
};

interface BlockDialogProps {
  open: boolean;
  counterpartName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function BlockDialog({ open, counterpartName, onOpenChange, onConfirm }: BlockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block {counterpartName}?</DialogTitle>
          <DialogDescription>
            Neither of you will be able to message the other, and any waves between you stop. They
            are not told that you blocked them — from their side the conversation simply goes quiet.
            You can undo this from the conversation at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Block {counterpartName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReportDialogProps {
  open: boolean;
  counterpartName: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: ReportReason, details: string | null) => Promise<void>;
}

export function ReportDialog({ open, counterpartName, onOpenChange, onSubmit }: ReportDialogProps) {
  const [reason, setReason] = useState<ReportReason>('harassment');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // The dialog stays open after a successful submit to say so. A report that
  // vanishes on send leaves the reporter unsure anything happened, which is the
  // last thing somebody in that moment needs.
  const [sent, setSent] = useState(false);

  function close(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setReason('harassment');
      setDetails('');
      setSent(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    await onSubmit(reason, details.trim() === '' ? null : details.trim());
    setSubmitting(false);
    setSent(true);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Report sent</DialogTitle>
              <DialogDescription>
                Thank you. A coordinator will review what you sent about {counterpartName}. You will
                not hear back automatically, but the report is on record.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                className="min-h-11"
                onClick={() => {
                  close(false);
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report {counterpartName}</DialogTitle>
              <DialogDescription>
                This goes to a coordinator, not to {counterpartName}. Blocking is separate — report
                and block both if you want the messages to stop as well.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              <Label htmlFor="report-reason">What happened?</Label>
              <Select
                value={reason}
                onValueChange={(next) => {
                  setReason(next as ReportReason);
                }}
              >
                <SelectTrigger id="report-reason" className="min-h-11 w-full">
                  <SelectValue placeholder="Pick a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_REASONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {REPORT_REASON_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="report-details">Anything else? (optional)</Label>
              <textarea
                id="report-details"
                value={details}
                onChange={(event) => {
                  setDetails(event.target.value);
                }}
                rows={4}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px]"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => {
                  close(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="min-h-11"
                disabled={submitting}
                onClick={() => {
                  void submit();
                }}
              >
                Send report
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
