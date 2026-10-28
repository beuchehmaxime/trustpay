'use client';

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

import { LANGUAGES, setAppLanguage } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export default function LanguagePage() {
  const { t, i18n } = useTranslation();
  const current = i18n.language?.startsWith('fr') ? 'fr' : 'en';

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4">
      {/* Full-width header band */}
      <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5 md:mx-0 md:mt-0 md:rounded-2xl md:border md:px-6 md:pt-6">
        <h1 className="text-xl font-extrabold text-ink">{t('settings.language.title')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t('settings.language.subtitle')}</p>
      </div>

      {/* Options */}
      <div className="shadow-card divide-y divide-[#F1F5FA] overflow-hidden rounded-2xl border border-hairline bg-surface">
        {LANGUAGES.map((code) => {
          const active = current === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => setAppLanguage(code)}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-4 text-left transition',
                active ? 'bg-brand-50/60' : 'hover:bg-muted/40',
              )}
            >
              <span className={cn('flex-1 text-[15px] font-bold', active ? 'text-brand-700' : 'text-ink')}>
                {t(`lang.${code}`)}
              </span>
              <span className={cn('text-[12px] font-bold', active ? 'text-brand-600' : 'text-muted-foreground')}>
                {code.toUpperCase()}
              </span>
              {active ? <Check className="size-4.5 text-brand-600" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
