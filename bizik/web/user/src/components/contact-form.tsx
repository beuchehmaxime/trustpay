'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Where the contact form's mailto message is addressed. */
const SUPPORT_EMAIL = 'support@bizik.cm';

const schema = z.object({
  name: z.string().min(2, 'Enter your name'),
  email: z.string().email('Enter a valid email'),
  subject: z.string().min(2, 'Add a subject'),
  message: z.string().min(10, 'Tell us a little more'),
});
type Values = z.infer<typeof schema>;

/**
 * Contact form. There is no contact endpoint on the API yet, so submitting
 * opens the visitor's email client with a pre-filled message to support
 * (a real handoff) rather than faking a "sent" confirmation.
 */
export function ContactForm() {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', subject: '', message: '' },
  });

  function onSubmit(values: Values) {
    const subject = encodeURIComponent(values.subject);
    const body = encodeURIComponent(
      `Name: ${values.name}\nEmail: ${values.email}\n\n${values.message}`,
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  const err = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={err.name?.message}>
          <Input placeholder="Amara Okafor" {...form.register('name')} />
        </Field>
        <Field label="Email" error={err.email?.message}>
          <Input type="email" placeholder="you@example.com" {...form.register('email')} />
        </Field>
      </div>
      <Field label="Subject" error={err.subject?.message}>
        <Input placeholder="How can we help?" {...form.register('subject')} />
      </Field>
      <Field label="Message" error={err.message?.message}>
        <textarea
          rows={5}
          placeholder="Write your message…"
          className="flex w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          {...form.register('message')}
        />
      </Field>
      <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
        Send message
        <Send className="size-4" />
      </Button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
