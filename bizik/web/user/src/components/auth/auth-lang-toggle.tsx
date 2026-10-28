'use client';

import { useTranslation } from 'react-i18next';

import { LANGUAGES, setAppLanguage } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * EN / FR pill. White-on-gradient over the mobile brand backdrop; a bordered
 * light-surface pill on the desktop form column.
 */
export function AuthLangToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('fr') ? 'fr' : 'en';

  return (
    <div className="flex rounded-full bg-white/15 p-1 backdrop-blur lg:border lg:border-hairline lg:bg-surface lg:backdrop-blur-none">
      {LANGUAGES.map((code) => {
        const active = current === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => setAppLanguage(code)}
            className={cn(
              'rounded-full px-3.5 py-1 text-[12px] font-bold transition',
              active
                ? 'bg-white text-brand-700 shadow-sm lg:bg-brand-500 lg:text-white'
                : 'text-white/85 hover:text-white lg:text-muted-foreground lg:hover:text-ink',
            )}
          >
            {code.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
