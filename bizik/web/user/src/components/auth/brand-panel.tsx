'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Lock, Layers, ShieldCheck } from 'lucide-react';

/**
 * Marketing panel beside the auth forms on large screens.
 *
 * Every string comes from the translation catalogue - the panel used to hold
 * hardcoded English, so switching to French changed the form and left this
 * side untouched.
 *
 * Sized to fit one viewport without scrolling: the auth shell is pinned to the
 * viewport height, so anything added here has to earn its space. The register
 * form is the taller column and it is the one allowed to scroll.
 */
export function AuthBrandPanel() {
  const { t } = useTranslation();

  const features = [
    { icon: Lock, title: t('auth.panel.feature1Title'), body: t('auth.panel.feature1Body') },
    { icon: Layers, title: t('auth.panel.feature2Title'), body: t('auth.panel.feature2Body') },
    { icon: ShieldCheck, title: t('auth.panel.feature3Title'), body: t('auth.panel.feature3Body') },
  ];

  /** Figures match the ones published on the marketing site. */
  const stats = [
    { value: '1.4B', label: t('auth.panel.stat1Label') },
    { value: '9,200+', label: t('auth.panel.stat2Label') },
    { value: '48h', label: t('auth.panel.stat3Label') },
  ];

  return (
    <div className="relative hidden flex-col overflow-hidden bg-linear-to-br from-[#0B1F3A] via-[#0E2748] to-[#123A5E] p-8 text-white lg:flex xl:p-10">
      {/* Faint concentric rings, top-right */}
      <div className="pointer-events-none absolute -right-24 -top-20 size-[420px] rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -right-10 -top-6 size-[260px] rounded-full border border-white/10" />

      {/* Header row: lockup + platform tag */}
      <div className="relative z-10 flex items-center justify-between gap-4">
        <Link href="/" className="w-fit" aria-label="Bizik home">
          <Image
            src="/brand/logo-landscape.png"
            alt="Bizik"
            width={4647}
            height={1491}
            priority
            className="h-8 w-auto"
          />
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
          {t('auth.panel.tag')}
        </span>
      </div>

      {/* Headline + intro */}
      <div className="relative z-10 mt-8 max-w-md">
        <h2 className="text-[30px] font-extrabold leading-[1.12] tracking-[-0.6px] xl:text-[34px]">
          {t('auth.heroTitle')}
        </h2>
        <p className="mt-3 text-[14.5px] leading-relaxed text-white/70">{t('auth.panel.intro')}</p>
      </div>

      {/* Feature list */}
      <div className="relative z-10 mt-7 grid max-w-md gap-4">
        {features.map((feature) => (
          <div key={feature.title} className="flex gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
              <feature.icon className="size-[18px]" />
            </span>
            <div>
              <p className="text-[14.5px] font-bold">{feature.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-white/60">{feature.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="relative z-10 mt-auto border-t border-white/10 pt-5">
        <div className="grid max-w-md grid-cols-3 gap-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-[22px] font-extrabold tracking-[-0.5px]">{stat.value}</p>
              <p className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/45">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
