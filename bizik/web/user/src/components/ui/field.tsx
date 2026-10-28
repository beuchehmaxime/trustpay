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
 * The width of the icon column at either end of the field, in pixels.
 *
 * The icon sits centred in this column and the input's padding is set to the
 * same number, so text can only ever begin where the icon's box ends. Both
 * come from this one constant and are applied as inline styles rather than
 * utility classes: the two have to agree exactly, and a padding utility that
 * fails to apply for any reason drops the text straight under the icon.
 */
const GUTTER = 44;
/** Padding on an end that has no icon. */
const EDGE = 16;

/**
 * BiZik text field - a bespoke input (not the stock shadcn one): tall, softly
 * rounded, with an inset icon, a smooth brand focus ring, an inline password
 * reveal, and a clear error state. Forwards its ref so it drops straight into
 * react-hook-form via `{...register(name)}`.
 */
export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, icon, action, type = 'text', className, id, name, style, ...props }, ref) => {
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
            <span
              style={{ width: GUTTER }}
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-muted-foreground [&_svg]:size-[18px]"
            >
              {icon}
            </span>
          ) : null}

          <input
            id={fieldId}
            name={name}
            ref={ref}
            type={inputType}
            style={{
              paddingLeft: icon ? GUTTER : EDGE,
              paddingRight: isPassword ? GUTTER : EDGE,
              ...style,
            }}
            className={cn(
              'h-12 w-full rounded-lg border bg-white text-[15px] text-ink transition outline-none',
              'placeholder:text-muted-foreground/70',
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
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
              style={{ width: GUTTER }}
              className="absolute inset-y-0 right-0 flex items-center justify-center text-muted-foreground transition-colors hover:text-ink"
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
