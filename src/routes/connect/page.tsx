import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { MENTORS } from '@/mocks/seed';

interface ConnectFormValues {
  message: string;
}

export default function ConnectPage() {
  const [open, setOpen] = useState(false);
  const mentor = MENTORS[0];
  const form = useForm<ConnectFormValues>({ defaultValues: { message: '' } });

  function onSubmit(_values: ConnectFormValues): void {
    // No backend in the prototype — this is where a real "create Connection"
    // call would go (see Connection in src/types/domain.ts, status "requested").
    // The stub just closes the dialog; see the TODO block below.
    setOpen(false);
    form.reset();
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Connect</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        The connect action lets a mentee either send a message or, depending on the mentor's privacy
        settings, reveal contact info directly. It's reached from a mentor's profile page and is the
        moment a browsing mentee turns into a requested Connection.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{mentor?.displayName ?? 'Mentor'}</CardTitle>
          <CardDescription>
            Privacy setting for this mentor: <Badge variant="outline">message first</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Send a message</Button>
            </DialogTrigger>
            <DialogContent>
              <Form {...form}>
                <form
                  onSubmit={(event) => {
                    void form.handleSubmit(onSubmit)(event);
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>Message {mentor?.displayName}</DialogTitle>
                    <DialogDescription>
                      Sent as a connection request. {mentor?.displayName} sees your basic profile
                      info, nothing more, unless they accept.
                    </DialogDescription>
                  </DialogHeader>

                  <FormField
                    control={form.control}
                    name="message"
                    rules={{ required: "Say a bit about what you're looking for." }}
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>Message</FormLabel>
                        <FormControl>
                          <textarea
                            {...field}
                            rows={4}
                            placeholder="Hi! I'm looking for advice on…"
                            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter className="mt-4">
                    <Button type="submit">Send request</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Button variant="outline" disabled>
            Reveal contact info
          </Button>
        </CardContent>
      </Card>

      {/* TODO(team): Connect action acceptance criteria
        - [ ] Wire "Reveal contact info" to the mentor's actual privacy setting: some mentors
              allow direct contact reveal, others require a message-first flow (like the
              default stubbed above).
        - [ ] On submit, create a mock Connection (src/types/domain.ts) with status "requested"
              and add it to local/mock state so the coordinator dashboard's last-touchpoint
              tracking has something to show.
        - [ ] Show request status back to the mentee (requested / accepted / declined) once a
              coordinator or mentor "responds" in the mock data.
        - [ ] Never reveal a mentor's precise contact info by default — see docs/PII.md.
      */}
    </div>
  );
}
