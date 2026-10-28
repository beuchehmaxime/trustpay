'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { cn } from '@/lib/utils';

interface FieldProps extends Omit<React.ComponentProps<'input'>, 'children'> {
  label?: string;
  error?: string;
  /** Optional icon rendered inside the field on the left. */
  icon?: React.ReactNode;
  /** Optional element rendered on the right of the label row (e.g. a link). */
  action?: React.ReactNode;
}

/**
 * BiZik text field - a bespoke input (not the stock shadcn one): tall, softly
 * rounded, with an inset icon, a smooth brand focus ring, an inline password
 * reveal, and a clear error state. Forwards its ref so it drops straight into
 * react-hook-form via `{...register(name)}`.
 */
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, icon, action, type = 'text', className, id, name, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    const isPassword = type === 'password';
    const inputType = isPassword ? (show ? 'text' : 'password') : type;
    const fieldId = id ?? name;

    return (
      <div className="grid gap-1.5">
        {label || action ? (
          <div className="flex items-center justify-between gap-2">
            {label ? (
              <label htmlFor={fieldId} className="text-[13px] font-semibold text-ink">
                {label}
              </label>
            ) : (
              <span />
            )}
            {action}
          </div>
        ) : null}

        <div className="relative">
          {icon ? (
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground [&_svg]:size-[18px]">
              {icon}
            </span>
          ) : null}

          <input
            id={fieldId}
            name={name}
            ref={ref}
            type={inputType}
            className={cn(
              'h-12 w-full rounded-lg border bg-white text-[15px] text-ink transition outline-none',
              'placeholder:text-muted-foreground/70',
              icon ? 'pl-11' : 'pl-4',
              isPassword ? 'pr-11' : 'pr-4',
              error
                ? 'border-negative/70 focus:border-negative focus:ring-4 focus:ring-negative/10'
                : 'border-field hover:border-muted-foreground/50 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10',
              className,
            )}
            aria-invalid={!!error}
            {...props}
          />

          {isPassword ? (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShow((visible) => !visible)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-ink"
            >
              {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          ) : null}
        </div>

        {error ? <p className="text-xs font-medium text-negative">{error}</p> : null}
      </div>
    );
  },
);
Field.displayName = 'Field';
