'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AssistantProposal } from '@/lib/api/assistant.api';
import { AssistantText } from './assistant-text';

/**
 * The approval card.
 *
 * This is the human step in "the model proposes, a human approves". Everything
 * about it is built to make that step real rather than ceremonial:
 *
 *   - it says plainly that nothing has happened yet, because the message above
 *     it was written by a model and may read as though something did
 *   - the summary comes from the backend, not the model, so what is approved
 *     and what is shown cannot drift apart
 *   - Approve is never the easy default: it needs a PIN, and the card stays
 *     dismissable right up to the moment it runs
 *
 * It holds the PIN in component state only. Nothing persists it, nothing logs
 * it, and it is dropped the moment the card unmounts.
 */
export function ProposalCard({
  proposal,
  busy,
  onApprove,
  onDismiss,
  onCreatePin,
}: {
  proposal: AssistantProposal;
  busy: boolean;
  onApprove: (pin?: string) => void;
  onDismiss: () => void;
  onCreatePin: (pin: string) => void;
}) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.round((proposal.expiresAt - Date.now()) / 1000)),
  );

  // A confirmation that sits there indefinitely is a trap: the balances it was
  // computed against move on. The countdown is the honest version of that.
  useEffect(() => {
    setPin('');
    const tick = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((proposal.expiresAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(tick);
  }, [proposal.id, proposal.expiresAt]);

  const expired = secondsLeft <= 0;
  const pinReady = /^\d{4,6}$/.test(pin);
  const needsPin = proposal.requiresPin && !proposal.needsPinSetup;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        {/* The summary is written by the BACKEND, not the model, so what is
            approved and what is shown cannot drift apart. It arrives in
            WhatsApp's conventions, which the shared formatter also reads. */}
        <div className="min-w-0 flex-1 space-y-0.5 text-sm text-foreground">
          <AssistantText text={proposal.summary} />
          <p className="pt-1 text-xs text-muted-foreground">
            {expired ? t('assistant.proposalExpired') : t('assistant.nothingHappenedYet')}
          </p>
        </div>
      </div>

      {proposal.needsPinSetup && !expired && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">{t('assistant.createPinPrompt')}</p>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            placeholder={t('assistant.pinPlaceholder')}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
          />
          <Button
            className="w-full"
            disabled={!pinReady || busy}
            onClick={() => onCreatePin(pin)}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t('assistant.createPin')}
          </Button>
        </div>
      )}

      {needsPin && !expired && (
        <div className="mt-3">
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder={t('assistant.pinPlaceholder')}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && pinReady && !busy) onApprove(pin);
            }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onDismiss} disabled={busy}>
          {t('assistant.dismiss')}
        </Button>
        {!proposal.needsPinSetup && (
          <Button
            size="sm"
            className="flex-1"
            disabled={busy || expired || (needsPin && !pinReady)}
            onClick={() => onApprove(needsPin ? pin : undefined)}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {t('assistant.approve')}
          </Button>
        )}
      </div>

      {!expired && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {t('assistant.expiresIn', { time: `${minutes}:${seconds}` })}
        </p>
      )}
    </div>
  );
}
