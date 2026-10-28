'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';

export interface RevisionModalData {
  milestoneId: string;
  milestoneIndex: number;
  milestoneTitle: string;
}

const MIN_FEEDBACK = 3;
const MAX_FEEDBACK = 2000;

export function RevisionModal({
  data,
  onCancel,
  onConfirm,
  busy,
}: {
  data: RevisionModalData | null;
  onCancel: () => void;
  onConfirm: (feedback: string) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!data) return;
    setFeedback('');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [data, onCancel]);

  if (!data) return null;

  const trimmedLength = feedback.trim().length;
  const canSend = trimmedLength >= MIN_FEEDBACK && feedback.length <= MAX_FEEDBACK && !busy;

  const send = () => {
    if (!canSend) return;
    onConfirm(feedback.trim());
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('deals.revision.cancel', { defaultValue: 'Cancel' })}
        onClick={onCancel}
        className="animate-in fade-in-0 absolute inset-0 bg-ink/40 backdrop-blur-[1px] duration-200"
      />
      <div className="animate-in fade-in-0 zoom-in-95 relative w-full max-w-md rounded-[26px] bg-surface p-6 shadow-dialog duration-200">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <RotateCcw className="size-6" strokeWidth={2.5} />
        </span>
        <h2 className="mt-4 text-lg font-extrabold tracking-[-0.3px] text-ink">
          {t('deals.revision.title', { defaultValue: 'Request a revision' })}
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          {t('deals.revision.subtitle', {
            defaultValue: 'Tell them what needs to change on “{{title}}”. This resets the review period.',
            title: data.milestoneTitle,
          })}
        </p>

        <div className="mt-4">
          <label htmlFor="revision-feedback" className="text-[13px] font-semibold text-ink">
            {t('deals.revision.feedbackLabel', { defaultValue: 'What needs changing?' })}
          </label>
          <textarea
            id="revision-feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value.slice(0, MAX_FEEDBACK))}
            rows={5}
            autoFocus
            placeholder={t('deals.revision.feedbackPlaceholder', {
              defaultValue: 'Be specific so they can fix it quickly…',
            })}
            className="mt-2 w-full resize-none rounded-2xl border border-hairline bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-subtle focus:border-brand-border"
          />
          <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-muted-foreground">
            <span>
              {trimmedLength < MIN_FEEDBACK
                ? t('deals.revision.minHint', { defaultValue: 'Add at least a few words.' })
                : ''}
            </span>
            <span>{feedback.length}/{MAX_FEEDBACK}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-xl border border-hairline px-5 text-[13.5px] font-semibold text-ink transition hover:bg-muted"
          >
            {t('deals.revision.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="bg-primary shadow-brand h-11 rounded-xl px-5 text-[13.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
          >
            {t('deals.revision.confirm', { defaultValue: 'Send revision request' })}
          </button>
        </div>
      </div>
    </div>
  );
}
