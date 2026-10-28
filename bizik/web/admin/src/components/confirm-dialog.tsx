'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'danger' | 'warning';

const TONE_ICON: Record<Tone, string> = {
  default: 'bg-brand-50 text-brand-600',
  danger: 'bg-negative-bg text-negative',
  warning: 'bg-amber-100 text-amber-600',
};

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colour of the icon badge and confirm button. */
  tone?: Tone;
  /** Shorthand: when true and no tone is set, uses the danger (red) tone. */
  destructive?: boolean;
  /** Icon rendered in the badge beside the title. */
  icon?: ComponentType<{ className?: string }>;
  /** Optional icon rendered inside the confirm button. */
  confirmIcon?: ComponentType<{ className?: string }>;
  /** Highlighted subject box, e.g. the account the action targets. */
  subject?: { label: string; value: ReactNode };
  /** Heading for the consequences list. */
  consequencesTitle?: string;
  /** Bulleted "what happens next" list shown in a caution box. */
  consequences?: string[];
  /** When set, shows a text field whose value is passed to onConfirm. */
  input?: {
    label?: string;
    placeholder?: string;
    required?: boolean;
    minLength?: number;
  };
  /** Runs when the user accepts; receives the input value when `input` is set. */
  onConfirm: (value: string) => void | Promise<void>;
}

/**
 * A controlled yes/no confirmation modal. Beyond a title and description it can
 * show an icon badge, a highlighted subject box, and a caution list spelling
 * out the consequences before the user commits.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone,
  destructive = false,
  icon: Icon,
  confirmIcon: ConfirmIcon,
  subject,
  consequencesTitle = 'What happens next:',
  consequences,
  input,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState('');
  const resolvedTone: Tone = tone ?? (destructive ? 'danger' : 'default');

  const trimmed = value.trim();
  const inputInvalid = input
    ? (input.required !== false && trimmed.length === 0) ||
      (input.minLength !== undefined && trimmed.length < input.minLength)
    : false;

  async function handleConfirm() {
    if (inputInvalid) return;
    try {
      setPending(true);
      await onConfirm(trimmed);
      onOpenChange(false);
      setValue('');
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) setValue('');
        onOpenChange(next);
      }}
    >
      <DialogContent className="gap-5 sm:max-w-lg">
        <div className="flex items-start gap-3 pr-6">
          {Icon ? (
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full',
                TONE_ICON[resolvedTone],
              )}
            >
              <Icon className="size-5" />
            </span>
          ) : null}
          <DialogHeader className="gap-1">
            <DialogTitle className="text-lg">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
        </div>

        {subject ? (
          <div className="rounded-lg border border-hairline bg-muted/50 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {subject.label}
            </p>
            <p className="mt-0.5 font-semibold text-ink">{subject.value}</p>
          </div>
        ) : null}

        {consequences && consequences.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" />
              <p className="text-sm font-semibold">{consequencesTitle}</p>
            </div>
            <ul className="mt-2 space-y-1.5">
              {consequences.map((item) => (
                <li key={item} className="flex gap-2 text-sm">
                  <span className="mt-1.75 size-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {input ? (
          <div className="space-y-1.5">
            {input.label ? (
              <label className="text-sm font-medium text-ink">{input.label}</label>
            ) : null}
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={input.placeholder}
              rows={3}
              className="w-full rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={resolvedTone === 'danger' ? 'destructive' : 'default'}
            className={cn(resolvedTone === 'warning' && 'bg-amber-500 text-white hover:bg-amber-600')}
            onClick={handleConfirm}
            disabled={pending || inputInvalid}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : ConfirmIcon ? (
              <ConfirmIcon className="size-4" />
            ) : null}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
