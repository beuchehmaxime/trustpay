'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Send } from 'lucide-react';

import { useCreateTicket } from '@/lib/hooks/use-support';
import type { TicketCategory } from '@/lib/api/support.api';
import { normaliseError } from '@/lib/api/client';
import { cn } from '@/lib/utils';

const CATEGORIES: TicketCategory[] = ['PAYMENTS', 'KYC', 'DISPUTES', 'ACCOUNT', 'TECHNICAL', 'OTHER'];

const FIELD_CLASS =
  'h-12 w-full rounded-xl border border-hairline bg-surface px-3.5 text-[14px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-border';

export default function NewTicketPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const createTicket = useCreateTicket();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('OTHER');
  const [body, setBody] = useState('');

  const valid = subject.trim().length >= 3 && body.trim().length >= 5;

  async function submit() {
    if (!valid || createTicket.isPending) return;
    try {
      const created = await createTicket.mutateAsync({
        subject: subject.trim(),
        category,
        body: body.trim(),
      });
      toast.success(t('support.ticketCreated'));
      router.push(`/support/${created.id}`);
    } catch (error) {
      toast.error(normaliseError(error).message || t('support.actionError'));
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4">
      {/* Back (mobile - no top bar) */}
      <Link
        href="/support"
        className="flex w-fit items-center gap-1.5 text-[14px] font-semibold text-brand-700 md:hidden"
      >
        <ArrowLeft className="size-4" />
        {t('support.title')}
      </Link>

      {/* Full-width header band */}
      <div className="-mx-4 -mt-4 border-b border-hairline bg-surface px-4 pb-4 pt-5 md:mx-0 md:mt-0 md:rounded-2xl md:border md:px-6 md:pt-6">
        <h1 className="text-xl font-extrabold text-ink">{t('support.newRequest')}</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">{t('support.newSubtitle')}</p>
      </div>

      <div className="space-y-4">
        {/* Subject */}
        <div className="min-w-0">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-body">{t('support.subject')}</label>
          <input
            className={FIELD_CLASS}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={t('support.subjectPlaceholder')}
          />
        </div>

        {/* Category */}
        <div className="min-w-0">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-body">{t('support.category')}</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((option) => {
              const selected = option === category;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                  className={cn(
                    'rounded-full border px-3.5 py-2 text-[13px] font-semibold transition',
                    selected
                      ? 'border-brand-500 bg-brand-500 text-white'
                      : 'border-hairline bg-surface text-muted-foreground hover:border-brand-border',
                  )}
                >
                  {t(`support.categories.${option}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Message */}
        <div className="min-w-0">
          <label className="mb-1.5 block text-[12.5px] font-semibold text-body">{t('support.message')}</label>
          <textarea
            className={cn(FIELD_CLASS, 'h-auto min-h-[140px] resize-y py-3 leading-relaxed')}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('support.messagePlaceholder')}
            rows={6}
          />
        </div>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={submit}
        disabled={!valid || createTicket.isPending}
        className="bg-primary shadow-brand flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        {createTicket.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        {t('support.send')}
      </button>
    </div>
  );
}
