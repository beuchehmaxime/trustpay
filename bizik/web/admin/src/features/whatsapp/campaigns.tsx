'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  StopCircle,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { normaliseError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import {
  useCampaign,
  useCampaignPreview,
  useCampaignSegments,
  useCampaigns,
  useCancelCampaign,
  useOutreachRail,
  useRetryCampaign,
  useSendCampaign,
} from './hooks';
import type { Campaign, CampaignRecipientStatus, CampaignStatus } from './types';

/**
 * Outreach campaigns: the platform messaging a group of users on WhatsApp.
 *
 * Its own page rather than a section of the channel page. The two are different
 * jobs with different permissions - reading conversations is support work,
 * messaging thousands of people unprompted is not - and stacking them made a
 * page that could not be scanned.
 *
 * The assistant REPLIES, inside the 24-hour window WhatsApp gives it. A
 * campaign STARTS the conversation, which Meta only allows through a template
 * it has already approved - so the composer asks for a template name and its
 * variables, not for a message. Sending prose here would fail for nearly every
 * recipient and damage the number's standing with Meta, which is why there is
 * no free-text field at all.
 *
 * The audience is shown, and sampled, before anything is sent: a segment key is
 * the easiest thing in the world to get wrong, and the mistake is only visible
 * after thousands of people have been messaged.
 */

const STATUS_STYLE: Record<CampaignStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  SENDING: { label: 'Sending', className: 'bg-brand-50 text-brand-700' },
  SENT: { label: 'Sent', className: 'bg-positive-bg text-positive-text' },
  FAILED: { label: 'Failed', className: 'bg-negative-bg-soft text-negative' },
  CANCELLED: { label: 'Stopped', className: 'bg-muted text-muted-foreground' },
};

const RECIPIENT_STYLE: Record<CampaignRecipientStatus, { label: string; className: string }> = {
  QUEUED: { label: 'Queued', className: 'text-muted-foreground' },
  SENT: { label: 'Sent', className: 'text-positive-text' },
  FAILED: { label: 'Failed', className: 'text-negative' },
  SKIPPED_OPTOUT: { label: 'Skipped (opted out)', className: 'text-warning-text' },
};

export function Campaigns({ canSend }: { canSend: boolean }) {
  const [composing, setComposing] = useState(false);
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null);
  const campaigns = useCampaigns();

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-extrabold text-ink">WhatsApp outreach</h1>
            <p className="mt-0.5 max-w-2xl text-[13px] text-muted-foreground">
              Message a group of users - people who signed up but never verified, verified but never
              dealt, and so on. Messages go out slowly, one small batch at a time, and anyone who
              opted out is skipped.
            </p>
          </div>
        </div>
        {canSend ? (
          <button
            type="button"
            onClick={() => setComposing((open) => !open)}
            className="bg-primary flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:opacity-95"
          >
            {composing ? <X className="size-4" /> : <Plus className="size-4" />}
            {composing ? 'Close' : 'New campaign'}
          </button>
        ) : (
          <p className="max-w-xs text-[11.5px] text-muted-foreground">
            You can read what was sent. Sending a campaign needs the outreach send permission.
          </p>
        )}
      </div>

      {/* No overflow-hidden on the section below: it clips `position: sticky`
          on every descendant, which is what left the send button off the
          bottom of the screen. The composer rounds its own corners instead, so
          the tinted background is still clipped. */}
      {composing && canSend ? (
        <section className="shadow-card rounded-2xl border border-hairline bg-surface">
          <Composer onSent={() => setComposing(false)} />
        </section>
      ) : null}

      <section className="shadow-card rounded-2xl border border-hairline bg-surface">
        <div className="p-5">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-subtle">History</h2>
          {campaigns.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !campaigns.data?.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No campaign has been sent yet.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-hairline">
              {campaigns.data.map((campaign) => (
                <CampaignRow
                  key={campaign.id}
                  campaign={campaign}
                  onOpen={() =>
                    setOpenCampaignId((current) => (current === campaign.id ? null : campaign.id))
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {openCampaignId ? (
          <CampaignDetailPanel
            id={openCampaignId}
            canSend={canSend}
            onClose={() => setOpenCampaignId(null)}
          />
        ) : null}
      </section>
    </div>
  );
}

// ---- Composer ---------------------------------------------------------------

function Composer({ onSent }: { onSent: () => void }) {
  const segments = useCampaignSegments();
  const send = useSendCampaign();

  const [segment, setSegment] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('');
  const [language, setLanguage] = useState('en');
  const [variables, setVariables] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Which rail is live decides what this form has to collect. Meta needs the
  // name of a template it has approved; WasenderAPI sends the text itself.
  const rail = useOutreachRail();
  const freeText = rail.data?.freeText ?? false;

  const preview = useCampaignPreview(segment);
  const chosen = useMemo(
    () => segments.data?.find((entry) => entry.key === segment) ?? null,
    [segments.data, segment],
  );

  const templateLooksValid = /^[a-z0-9_]+$/.test(template);
  const ready =
    !!segment &&
    name.trim().length >= 3 &&
    (freeText ? body.trim().length >= 10 : templateLooksValid);

  function submit() {
    send.mutate(
      {
        name: name.trim(),
        segment: segment as string,
        template: template.trim(),
        body: body.trim() || undefined,
        language,
        // Empty boxes are not variables; Meta rejects a blank one.
        variables: variables.map((value) => value.trim()).filter(Boolean),
        note: note.trim() || undefined,
      },
      {
        onSuccess: (campaign) => {
          toast.success(`Sending to ${campaign.audienceSize.toLocaleString()} people`);
          onSent();
        },
        onError: (error) => toast.error(normaliseError(error).message),
      },
    );
  }

  return (
    <div className="rounded-2xl bg-brand-50/30 p-5">
      {/* ── Who ── */}
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-subtle">1. Who to message</h3>
      {segments.isLoading ? (
        <div className="flex py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {segments.data?.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setSegment(entry.key)}
              disabled={entry.count === 0}
              className={cn(
                'rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                segment === entry.key
                  ? 'border-brand-400 bg-white ring-4 ring-brand-500/10'
                  : 'border-hairline bg-white/70 hover:border-brand-200',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-ink">{entry.label}</span>
                <span className="text-sm font-extrabold tabular-nums text-brand-700">
                  {entry.count.toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {entry.description}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* ── Audience check ── */}
      {segment ? (
        <div className="mt-4 rounded-xl border border-hairline bg-white p-4">
          {preview.isLoading ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : preview.data ? (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Figure icon={Users} label="In this segment" value={preview.data.total} />
                <Figure
                  icon={Send}
                  label="Will be messaged"
                  value={preview.data.reachable}
                  tone="good"
                />
                <Figure
                  icon={XCircle}
                  label="Opted out, skipped"
                  value={preview.data.optedOut}
                  tone={preview.data.optedOut ? 'warn' : undefined}
                />
              </div>

              {preview.data.capped ? (
                <p className="mt-3 flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  This segment is larger than one campaign can send to. Only the newest 5,000
                  accounts will be included.
                </p>
              ) : null}

              {preview.data.sample.length ? (
                <div className="mt-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                    A few of them
                  </p>
                  <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {preview.data.sample.map((person) => (
                      <li key={person.phone} className="text-[11px] text-muted-foreground">
                        {person.name ?? 'Unnamed'}{' '}
                        <span className="tabular-nums text-subtle">{person.phone}</span>
                        {person.optedOut ? (
                          <span className="ml-1 text-warning-text">(opted out)</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Could not read that segment.</p>
          )}
        </div>
      ) : null}

      {/* ── What ── */}
      <h3 className="mt-6 text-[11px] font-bold uppercase tracking-wider text-subtle">
        2. What to send
      </h3>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {freeText ? (
          <>
            This rail sends the message text itself, so write it here - there is no template to
            approve. It goes out slowly on purpose
            {rail.data ? ` (about ${rail.data.perMinute} a minute, ${rail.data.dailyCap} a day)` : ''}
            : bulk messages from a linked WhatsApp account are what gets a number banned, and it is
            the same number that sends verification codes.
          </>
        ) : (
          <>
            WhatsApp will not deliver a message the person did not ask for unless it uses a template
            Meta has approved. Create the template in WhatsApp Manager, then name it here.
          </>
        )}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Campaign name" hint="Internal only - how you will recognise it later">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="September - nudge unverified signups"
            className={inputClass}
          />
        </Field>

        {!freeText ? (
          <Field
            label="Template name"
            hint="Lowercase letters, numbers and underscores"
            error={template && !templateLooksValid ? 'That is not a valid template name.' : undefined}
          >
            <input
              value={template}
              onChange={(event) => setTemplate(event.target.value.toLowerCase())}
              placeholder="finish_your_verification"
              className={inputClass}
            />
          </Field>
        ) : null}

        <Field label="Template language" hint="The language code the template was approved in">
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className={inputClass}
          >
            <option value="en">en - English</option>
            <option value="en_US">en_US - English (US)</option>
            <option value="fr">fr - French</option>
          </select>
        </Field>

        <Field label="Why this campaign" hint="Recorded with it, never sent to anyone">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Following up the 40 signups from launch week"
            className={inputClass}
          />
        </Field>
      </div>

      {/* ── The message itself, on a rail that sends prose ── */}
      {freeText ? (
        <div className="mt-3">
          <Field
            label="Message"
            hint="Exactly what each person receives. Write {name} for their first name."
            error={
              body.trim().length > 0 && body.trim().length < 10
                ? 'Write the full message - this is what people will read.'
                : undefined
            }
          >
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={
                'Hi, it is Bizik. You started an account but have not finished verifying yet - ' +
                'it takes two minutes and unlocks sending, withdrawing and deals. Reply STOP to opt out.'
              }
              className={cn(inputClass, 'h-auto resize-y py-2 leading-relaxed')}
            />
          </Field>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {body.trim().length} characters. Say who it is from and why they are hearing from you -
            an unexpected message from an unknown number is the one people report, and reports are
            what get a number banned.
          </p>
          {/* Shown only once the token is actually used, so the composer does
              not lecture somebody who already knows. */}
          {/\{name\}/i.test(body) ? (
            <p className="mt-1.5 text-[11px] text-brand-700">
              <strong>{'{name}'}</strong> becomes each person&apos;s first name, from their account.
              Somebody with no name on file simply gets the greeting without one - no blank, no
              stray comma.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Template variables ── */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-ink">
            Template variables{' '}
            <span className="font-normal text-muted-foreground">
              (the {'{{1}}'}, {'{{2}}'} placeholders, in order)
            </span>
          </p>
          <button
            type="button"
            onClick={() => setVariables((current) => [...current, ''])}
            className="flex h-7 items-center gap-1 rounded-lg border border-hairline px-2 text-[11px] font-semibold text-muted-foreground transition hover:text-ink"
          >
            <Plus className="size-3" />
            Add
          </button>
        </div>
        {variables.length ? (
          <div className="mt-2 grid gap-2">
            {variables.map((value, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-[11px] font-bold tabular-nums text-subtle">
                  {`{{${index + 1}}}`}
                </span>
                <input
                  value={value}
                  onChange={(event) =>
                    setVariables((current) =>
                      current.map((entry, position) =>
                        position === index ? event.target.value : entry,
                      ),
                    )
                  }
                  placeholder="The same value for everyone in this campaign"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() =>
                    setVariables((current) => current.filter((_, position) => position !== index))
                  }
                  aria-label={`Remove variable ${index + 1}`}
                  className="text-muted-foreground transition hover:text-negative"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            None. Add one for each placeholder in the template body; every recipient gets the same
            value, so do not use these for a person&apos;s name.
          </p>
        )}
      </div>

      {/* Sticky, because this form grew a message box and the primary action
          ended up 23px from the bottom of a 1000px window - present, enabled,
          and off the bottom of the screen unless you knew to scroll. A form
          whose height depends on how much someone types should not put its
          only action at an unpredictable depth. */}
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 flex items-center gap-3 rounded-b-2xl border-t border-hairline bg-brand-50/90 px-5 py-3 backdrop-blur">
        <button
          type="button"
          disabled={!ready || send.isPending}
          onClick={() => setConfirming(true)}
          className={cn(
            'flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition',
            ready && !send.isPending
              ? 'bg-primary text-white hover:opacity-95'
              : // Grey, not a faded blue. A disabled primary button at 50%
                // opacity still looks pressable, which is how somebody ends up
                // clicking it and concluding the page is broken.
                'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Review and send
        </button>
        {!ready ? (
          // Says which field is missing, rather than listing all of them and
          // leaving the operator to work out which one they skipped - and it
          // never mentions a template on a rail that has none.
          <p className="text-[11px] text-muted-foreground">
            {!segment
              ? 'Pick a segment above.'
              : name.trim().length < 3
                ? 'Give the campaign a name.'
                : freeText
                  ? 'Write the message.'
                  : 'Name an approved template.'}
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Send this campaign?"
        description="Messages go out immediately and cannot be recalled once delivered."
        confirmLabel="Send now"
        confirmIcon={Send}
        icon={Megaphone}
        subject={{
          label: chosen?.label ?? 'Audience',
          // On the free-text rail there is no template, so naming one here read
          // as `template ""` - which looks like the form is not ready.
          value: freeText
            ? `${(preview.data?.reachable ?? 0).toLocaleString()} people - your own message`
            : `${(preview.data?.reachable ?? 0).toLocaleString()} people - template "${template}" (${language})`,
        }}
        consequencesTitle="Before you send"
        consequences={[
          freeText
            ? `Everyone in the segment gets one WhatsApp message, about ${rail.data?.perMinute ?? 10} a minute.`
            : 'Everyone in the segment gets one WhatsApp message from the BiZik number.',
          'People who turned WhatsApp messages off are skipped, and recorded as skipped.',
          freeText
            ? 'Messages are sent slowly on purpose - a burst is what gets a WhatsApp number banned.'
            : 'A template Meta has not approved will fail for every recipient - check the name.',
          'Sending is recorded in the audit log against your account.',
        ]}
        onConfirm={submit}
      />
    </div>
  );
}

// ---- History ----------------------------------------------------------------

function CampaignRow({ campaign, onOpen }: { campaign: Campaign; onOpen: () => void }) {
  const status = STATUS_STYLE[campaign.status];
  const delivered = campaign.sentCount + campaign.failedCount + campaign.skippedCount;
  const progress = campaign.audienceSize
    ? Math.round((delivered / campaign.audienceSize) * 100)
    : 0;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full py-3 text-left transition hover:bg-brand-50/40"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{campaign.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {campaign.segmentLabel} · {campaign.template} ({campaign.language})
              {campaign.createdBy ? ` · by ${campaign.createdBy}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {campaign.sentCount.toLocaleString()} sent
              {campaign.failedCount ? ` · ${campaign.failedCount} failed` : ''}
              {campaign.skippedCount ? ` · ${campaign.skippedCount} skipped` : ''}
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide',
                status.className,
              )}
            >
              {status.label}
            </span>
          </div>
        </div>
        {campaign.status === 'SENDING' ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </button>
    </li>
  );
}

function CampaignDetailPanel({
  id,
  canSend,
  onClose,
}: {
  id: string;
  canSend: boolean;
  onClose: () => void;
}) {
  const campaign = useCampaign(id);
  const cancel = useCancelCampaign();
  const retry = useRetryCampaign();
  const [confirmStop, setConfirmStop] = useState(false);

  const data = campaign.data;

  return (
    <div className="border-t border-hairline bg-brand-50/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-bold text-ink">{data?.name ?? 'Campaign'}</h3>
          {data ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {data.segmentLabel} · template {data.template} ({data.language})
              {data.note ? ` · ${data.note}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {data?.status === 'SENDING' && canSend ? (
            <button
              type="button"
              onClick={() => setConfirmStop(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-negative-bg px-2.5 text-[11px] font-semibold text-negative transition hover:bg-negative-bg-soft"
            >
              <StopCircle className="size-3.5" />
              Stop sending
            </button>
          ) : null}
          {/* Only once it has stopped, and only when there is genuinely
              something to pick up. `retryable` is counted server-side and
              covers both groups - the failures worth another go, and whoever a
              stopped campaign never reached. Numbers with no WhatsApp account
              are not in it, so this never offers a retry that would refuse. */}
          {data && data.status !== 'SENDING' && data.retryable > 0 && canSend ? (
            <button
              type="button"
              disabled={retry.isPending}
              onClick={() =>
                retry.mutate(id, {
                  onSuccess: () =>
                    toast.success('Back in the queue', {
                      description: 'Anyone already messaged is skipped.',
                    }),
                  onError: (error) => toast.error(normaliseError(error).message),
                })
              }
              className="flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-[11px] font-semibold text-ink transition hover:bg-muted disabled:opacity-50"
            >
              {retry.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              {data.queuedCount > 0 && data.retryableFailed === 0
                ? `Resume ${data.queuedCount} remaining`
                : `Retry ${data.retryable}`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close campaign"
            className="text-muted-foreground transition hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {campaign.isLoading || !data ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Figure icon={Users} label="Audience" value={data.audienceSize} />
            <Figure icon={CheckCircle2} label="Sent" value={data.sentCount} tone="good" />
            <Figure
              icon={XCircle}
              label="Failed"
              value={data.failedCount}
              tone={data.failedCount ? 'bad' : undefined}
            />
            <Figure
              icon={AlertTriangle}
              label="Skipped"
              value={data.skippedCount}
              tone={data.skippedCount ? 'warn' : undefined}
            />
          </div>

          {data.variables.length ? (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Variables: {data.variables.map((value, index) => `{{${index + 1}}} ${value}`).join(' · ')}
            </p>
          ) : null}

          <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-hairline bg-white">
            <table className="w-full text-left text-[11.5px]">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-hairline text-[10.5px] uppercase tracking-wider text-subtle">
                  <th className="px-3 py-2 font-bold">Number</th>
                  <th className="px-3 py-2 font-bold">Outcome</th>
                  <th className="px-3 py-2 font-bold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.recipients.map((recipient) => {
                  const style = RECIPIENT_STYLE[recipient.status];
                  return (
                    <tr key={recipient.id} className="border-b border-hairline/60 last:border-0">
                      <td className="px-3 py-1.5 tabular-nums text-ink">{recipient.phone}</td>
                      <td className={cn('px-3 py-1.5 font-semibold', style.className)}>
                        {style.label}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {recipient.error ?? (recipient.sentAt ? formatWhen(recipient.sentAt) : '-')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.audienceSize > data.recipients.length ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Showing the first {data.recipients.length.toLocaleString()} of{' '}
              {data.audienceSize.toLocaleString()}.
            </p>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        title="Stop sending this campaign?"
        description="Messages already delivered cannot be recalled."
        confirmLabel="Stop sending"
        destructive
        icon={StopCircle}
        consequences={[
          'Everyone still queued will not be messaged.',
          'The people already messaged keep their message - WhatsApp cannot take it back.',
          'The campaign is marked as stopped, with the counts it reached.',
        ]}
        onConfirm={() =>
          cancel.mutate(id, {
            onSuccess: () => toast.success('Campaign stopped'),
            onError: (error) => toast.error(normaliseError(error).message),
          })
        }
      />
    </div>
  );
}

// ---- Small pieces -----------------------------------------------------------

const inputClass =
  'h-9 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10';

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-ink">{label}</span>
      {children}
      {error ? (
        <span className="mt-0.5 block text-[10.5px] text-negative">{error}</span>
      ) : hint ? (
        <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function Figure({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone?: 'good' | 'warn' | 'bad';
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        className={cn(
          'size-4',
          tone === 'good'
            ? 'text-positive-text'
            : tone === 'warn'
              ? 'text-warning-text'
              : tone === 'bad'
                ? 'text-negative'
                : 'text-muted-foreground',
        )}
      />
      <div>
        <p className="text-base font-extrabold leading-none tabular-nums text-ink">
          {value.toLocaleString()}
        </p>
        <p className="text-[10.5px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
