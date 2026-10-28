import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Centered max-width content column shared by every marketing section. */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>
      {children}
    </div>
  );
}

/** Small pill label above a heading. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold tracking-wide text-brand-700 uppercase">
      {children}
    </span>
  );
}

/** Section heading block: optional eyebrow, title and supporting copy. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'center' | 'left';
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">{subtitle}</p>
      ) : null}
    </div>
  );
}

/** Icon + title + description card used across feature grids. */
export function FeatureCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-shadow hover:shadow-[0_8px_30px_rgba(16,24,40,0.06)]">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}

/** Soft hero band used at the top of secondary pages. */
export function PageHero({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className="border-b border-hairline bg-linear-to-b from-brand-50/70 to-surface">
      <Container className="py-16 text-center sm:py-20">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-lg leading-8 text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </Container>
    </section>
  );
}

/** Full-width call-to-action band (brand gradient). */
export function CTASection() {
  return (
    <section className="py-16 sm:py-20">
      <Container>
        <div className="relative overflow-hidden rounded-[32px] bg-linear-to-br from-brand-400 via-brand-500 to-cyan-400 px-6 py-14 text-center shadow-lg sm:px-12">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Start your first protected project today
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-white/90">
            Create an account in seconds. Only pay a small fee when a milestone is
            released - no subscriptions, no surprises.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="bg-white text-brand-700 hover:bg-white/90"
              render={<Link href="/login" />}
            >
              Get started
              <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/70 bg-transparent text-white hover:bg-white/10 hover:text-white"
              render={<Link href="/contact" />}
            >
              Talk to us
            </Button>
          </div>
        </div>
      </Container>
    </section>
  );
}
