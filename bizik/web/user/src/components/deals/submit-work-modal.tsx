'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudUpload, ImagePlus, RotateCcw, X } from 'lucide-react';

import { filesToDataUrls } from '@/lib/files';

export interface SubmitWorkModalData {
  milestoneId: string;
  milestoneTitle: string;
  revisionNote?: string | null;
}

const MAX_IMAGES = 10;
const MAX_NOTE = 2000;

export function SubmitWorkModal({
  data,
  onCancel,
  onConfirm,
  busy,
}: {
  data: SubmitWorkModalData | null;
  onCancel: () => void;
  onConfirm: (payload: { note?: string; images: string[] }) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!data) return;
    setNote('');
    setImages([]);
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

  const onPickImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files;
    if (!picked || picked.length === 0) return;
    const dataUrls = await filesToDataUrls(picked);
    event.target.value = '';
    setImages((current) => [...current, ...dataUrls].slice(0, MAX_IMAGES));
  };

  const removeImage = (targetIndex: number) => {
    setImages((current) => current.filter((_, index) => index !== targetIndex));
  };

  const submit = () => {
    if (busy) return;
    onConfirm({ note: note.trim() || undefined, images });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t('deals.submit.cancel', { defaultValue: 'Cancel' })}
        onClick={onCancel}
        className="animate-in fade-in-0 absolute inset-0 bg-ink/40 backdrop-blur-[1px] duration-200"
      />
      <div className="animate-in fade-in-0 zoom-in-95 relative flex max-h-[90vh] w-full max-w-md flex-col rounded-[26px] bg-surface p-6 shadow-dialog duration-200">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <CloudUpload className="size-6" strokeWidth={2.5} />
        </span>
        <h2 className="mt-4 text-lg font-extrabold tracking-[-0.3px] text-ink">
          {t('deals.submit.title', { defaultValue: 'Submit your work' })}
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          {t('deals.submit.subtitle', {
            defaultValue:
              'Add a note and photos of the completed work. The payer reviews before funds are released.',
          })}
        </p>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {/* Payer's revision request, so the payee sees what to fix. */}
          {data.revisionNote ? (
            <div className="mb-4 rounded-2xl border border-warning-border bg-warning-bg-soft p-3.5">
              <div className="flex items-center gap-2 text-warning-text">
                <RotateCcw className="size-4 shrink-0" />
                <p className="text-[11px] font-bold uppercase tracking-wider">
                  {t('deals.submit.whatToFix', { defaultValue: 'What to fix' })}
                </p>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-warning-text">{data.revisionNote}</p>
            </div>
          ) : null}

          <label htmlFor="submit-note" className="text-[13px] font-semibold text-ink">
            {t('deals.submit.noteLabel', { defaultValue: 'Note (optional)' })}
          </label>
          <textarea
            id="submit-note"
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
            rows={4}
            placeholder={t('deals.submit.notePlaceholder', { defaultValue: 'Describe what you delivered…' })}
            className="mt-2 w-full resize-none rounded-2xl border border-hairline bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-subtle focus:border-brand-border"
          />

          <div className="mt-4">
            <p className="text-[13px] font-semibold text-ink">
              {t('deals.submit.photosLabel', { defaultValue: 'Photos' })}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onPickImages}
              className="hidden"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {images.map((imageSrc, imageIndex) => (
                <div key={`${imageIndex}-${imageSrc.slice(-12)}`} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imageSrc} alt="" className="size-[74px] rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(imageIndex)}
                    aria-label={t('deals.submit.removePhoto', { defaultValue: 'Remove photo' })}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ink text-white transition hover:opacity-90"
                  >
                    <X className="size-3" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
              {images.length < MAX_IMAGES ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex size-[74px] flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-field bg-surface text-muted-foreground transition hover:border-brand-border hover:text-brand-700"
                >
                  <ImagePlus className="size-5" />
                  <span className="text-[10px] font-semibold">
                    {t('deals.submit.addPhotos', { defaultValue: 'Add photos' })}
                  </span>
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              {t('deals.submit.photosHint', { defaultValue: 'Up to {{max}} images.', max: MAX_IMAGES })}
            </p>
          </div>
        </div>

        <div className="mt-4 flex shrink-0 items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 rounded-xl border border-hairline px-5 text-[13.5px] font-semibold text-ink transition hover:bg-muted"
          >
            {t('deals.submit.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="bg-primary shadow-brand h-11 rounded-xl px-5 text-[13.5px] font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
          >
            {t('deals.submit.confirm', { defaultValue: 'Submit work' })}
          </button>
        </div>
      </div>
    </div>
  );
}
