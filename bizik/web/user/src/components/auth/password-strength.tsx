'use client';

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Live password rules + a 4-segment strength bar (register). */
export function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation();

  const rules = [
    { key: 'rule8', ok: password.length >= 8 },
    { key: 'ruleUpper', ok: /[A-Z]/.test(password) },
    { key: 'ruleNumber', ok: /[0-9]/.test(password) },
    { key: 'ruleSymbol', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = rules.filter((rule) => rule.ok).length;

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn('h-1.5 rounded-full transition-colors', index < score ? 'bg-[#16a34a]' : 'bg-[#EEF2F7]')}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {rules.map((rule) => (
          <li key={rule.key} className="inline-flex items-center gap-1.5 text-[12.5px]">
            {rule.ok ? (
              <Check className="size-3.5 shrink-0 text-[#16a34a]" strokeWidth={2.5} />
            ) : (
              <span className="size-3 shrink-0 rounded-full border-2 border-field" />
            )}
            <span className={rule.ok ? 'font-medium text-ink' : 'text-muted-foreground'}>
              {t(`auth.register.${rule.key}`)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
