'use client';

import { useState } from 'react';
import {
  BadgeCheck,
  Coins,
  FileText,
  Loader2,
  Lock,
  Plug,
  Save,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  UserX,
  Wrench,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { useSaveGroup, useSaveLegal, useSettings } from '@/features/settings/hooks';
import { DormantAccountsPanel } from '@/features/dormancy/dormant-accounts';
import type {
  GeneralSettings,
  LegalDocument,
  MarketsSettings,
  ProvidersSettings,
  SettingsOverview,
  VerificationSettings,
} from '@/features/settings/types';

type TabKey = 'general' | 'markets' | 'verification' | 'providers' | 'legal' | 'accounts';

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'general', label: 'General', icon: <Settings2 className="size-4" /> },
  { key: 'markets', label: 'Markets & currencies', icon: <Coins className="size-4" /> },
  { key: 'verification', label: 'Verification', icon: <ShieldCheck className="size-4" /> },
  { key: 'providers', label: 'Providers', icon: <Plug className="size-4" /> },
  { key: 'legal', label: 'Legal', icon: <FileText className="size-4" /> },
  // Its own tab rather than a card inside General: it is the only place in
  // Settings that deletes anything, and it is gated by a different permission.
  { key: 'accounts', label: 'Dormant accounts', icon: <UserX className="size-4" /> },
];

export default function SettingsPage() {
  const canView = usePermission('settings.view');
  const canManage = usePermission('settings.manage');
  const [tab, setTab] = useState<TabKey>('general');
  const { data, isLoading, isError, error } = useSettings(canView);

  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wider uppercase">
          <span className="text-muted-foreground">Access &amp; settings</span>{' '}
          <span className="text-ink">Settings</span>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Feature flags, supported countries and currencies, KYC thresholds, providers and legal content.
        </p>
        {!canManage ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            <Lock className="size-3.5" /> Read-only - you can view settings but not change them.
          </p>
        ) : null}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-hairline">
        {TABS.map((entry) => (
          <TabButton
            key={entry.key}
            active={tab === entry.key}
            onClick={() => setTab(entry.key)}
            icon={entry.icon}
          >
            {entry.label}
          </TabButton>
        ))}
      </div>

      {isError ? (
        <div className="p-2 text-sm text-destructive">{normaliseError(error).message}</div>
      ) : isLoading || !data ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <SettingsBody tab={tab} data={data} readOnly={!canManage} />
      )}
    </div>
  );
}

function SettingsBody({
  tab,
  data,
  readOnly,
}: {
  tab: TabKey;
  data: SettingsOverview;
  readOnly: boolean;
}) {
  // Remount each tab on data identity so drafts re-sync after a save.
  switch (tab) {
    case 'general':
      return <GeneralTab value={data.general} readOnly={readOnly} />;
    case 'markets':
      return <MarketsTab value={data.markets} readOnly={readOnly} />;
    case 'verification':
      return <VerificationTab value={data.verification} readOnly={readOnly} />;
    case 'providers':
      return <ProvidersTab value={data.providers} readOnly={readOnly} />;
    case 'legal':
      return <LegalTab documents={data.legal} readOnly={readOnly} />;
    case 'accounts':
      // Gated on accounts.purge INSIDE the panel, not on settings.manage, so
      // read-only here does not silently mean "can delete accounts".
      return <DormantAccountsPanel />;
    default:
      return null;
  }
}

/* --------------------------------------------------------------- General */

function GeneralTab({ value, readOnly }: { value: GeneralSettings; readOnly: boolean }) {
  const [draft, setDraft] = useState<GeneralSettings>(value);
  const save = useSaveGroup();

  function set<Key extends keyof GeneralSettings>(key: Key, next: GeneralSettings[Key]) {
    setDraft((current) => ({ ...current, [key]: next }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHead title="General" subtitle="Platform identity, sign-ups and language." />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Platform name">
            <TextInput value={draft.platformName} onChange={(next) => set('platformName', next)} disabled={readOnly} />
          </Field>
          <Field label="Support email">
            <TextInput value={draft.supportEmail} onChange={(next) => set('supportEmail', next)} disabled={readOnly} />
          </Field>
          <Field label="Default language">
            <Select
              value={draft.defaultLocale}
              onChange={(next) => set('defaultLocale', next as GeneralSettings['defaultLocale'])}
              disabled={readOnly}
              options={[
                { value: 'en', label: 'English' },
                { value: 'fr', label: 'French' },
              ]}
            />
          </Field>
        </div>

        <div className="mt-5 space-y-3">
          <ToggleRow
            label="Allow new sign-ups"
            hint="When off, the register endpoint is closed to new accounts."
            checked={draft.signupsEnabled}
            onChange={(next) => set('signupsEnabled', next)}
            disabled={readOnly}
          />
          <ToggleRow
            label="Require KYC to create contracts"
            hint="Freelancers must be verified before they can create or fund deals."
            checked={draft.kycRequiredForContracts}
            onChange={(next) => set('kycRequiredForContracts', next)}
            disabled={readOnly}
          />
        </div>

        <SaveBar
          readOnly={readOnly}
          pending={save.isPending}
          error={save.isError ? normaliseError(save.error).message : null}
          success={save.isSuccess}
          // Preserve maintenance state (owned by its own card) on a general save.
          onSave={() =>
            save.mutate({
              group: 'general',
              value: {
                ...draft,
                maintenanceMode: value.maintenanceMode,
                maintenanceMessage: value.maintenanceMessage,
              },
            })
          }
        />
      </Card>

      <MaintenanceCard value={value} readOnly={readOnly} />
    </div>
  );
}

/**
 * Maintenance mode lives in its own danger card and applies on toggle (not on
 * the Save button). Turning it ON opens a confirmation dialog that requires a
 * reason; turning it OFF restores service immediately.
 */
function MaintenanceCard({ value, readOnly }: { value: GeneralSettings; readOnly: boolean }) {
  const [modalOpen, setModalOpen] = useState(false);
  const save = useSaveGroup();
  const isOn = value.maintenanceMode;

  function turnOn(reason: string) {
    save.mutate(
      { group: 'general', value: { ...value, maintenanceMode: true, maintenanceMessage: reason } },
      { onSuccess: () => setModalOpen(false) },
    );
  }

  function turnOff() {
    save.mutate({ group: 'general', value: { ...value, maintenanceMode: false } });
  }

  function onToggle() {
    if (readOnly || save.isPending) return;
    if (isOn) turnOff();
    else setModalOpen(true);
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]',
        isOn ? 'border-destructive/50 bg-destructive/10' : 'border-destructive/30 bg-destructive/5',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Wrench className="size-4.5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-destructive">Maintenance mode</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Blocks all end-user access and shows a maintenance notice. The admin console stays open.
            </p>
          </div>
        </div>
        <Switch checked={isOn} onChange={onToggle} disabled={readOnly || save.isPending} tone="danger" />
      </div>

      {isOn ? (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-surface p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-destructive uppercase">
            <TriangleAlert className="size-3.5" /> Maintenance is live
          </p>
          <p className="mt-1 text-sm text-ink">{value.maintenanceMessage}</p>
        </div>
      ) : null}

      {save.isError ? (
        <p className="mt-3 text-sm text-destructive">{normaliseError(save.error).message}</p>
      ) : null}

      {modalOpen ? (
        <MaintenanceModal
          defaultReason={value.maintenanceMessage}
          pending={save.isPending}
          error={save.isError ? normaliseError(save.error).message : null}
          onCancel={() => setModalOpen(false)}
          onConfirm={turnOn}
        />
      ) : null}
    </div>
  );
}

function MaintenanceModal({
  defaultReason,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  defaultReason: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(defaultReason);
  const canConfirm = reason.trim().length >= 5 && !pending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
      />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-hairline bg-surface shadow-xl">
        <div className="flex items-start gap-3 border-b border-hairline p-5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <TriangleAlert className="size-5" />
          </span>
          <div>
            <h3 className="font-bold text-ink">Turn on maintenance mode?</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              This immediately blocks every end user from the platform. Only the admin console stays reachable.
            </p>
          </div>
        </div>

        <div className="p-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Reason (shown to users)
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              autoFocus
              maxLength={300}
              placeholder="e.g. Scheduled maintenance - back at 14:00 UTC."
              className="w-full resize-none rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </label>
          {reason.trim().length > 0 && reason.trim().length < 5 ? (
            <p className="mt-1.5 text-xs text-muted-foreground">Give users a slightly longer reason.</p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline p-4">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-field px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <TriangleAlert className="size-4" />}
            Yes, turn on maintenance mode
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Markets */

function MarketsTab({ value, readOnly }: { value: MarketsSettings; readOnly: boolean }) {
  const [draft, setDraft] = useState<MarketsSettings>(value);
  const save = useSaveGroup();

  function toggleCurrency(code: string) {
    setDraft((current) => ({
      ...current,
      currencies: current.currencies.map((currency) =>
        currency.code === code ? { ...currency, enabled: !currency.enabled } : currency,
      ),
    }));
  }

  function updateCountry(name: string, patch: Partial<MarketsSettings['countries'][number]>) {
    setDraft((current) => ({
      ...current,
      countries: current.countries.map((country) =>
        country.name === name ? { ...country, ...patch } : country,
      ),
    }));
  }

  const currencyOptions = draft.currencies.map((currency) => ({
    value: currency.code,
    label: `${currency.flag} ${currency.code}`,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHead title="Currencies" subtitle="Currencies users can hold, fund and withdraw in." />
        <Field label="Default currency" className="max-w-xs">
          <Select
            value={draft.defaultCurrency}
            onChange={(next) => setDraft((current) => ({ ...current, defaultCurrency: next as MarketsSettings['defaultCurrency'] }))}
            disabled={readOnly}
            options={currencyOptions}
          />
        </Field>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {draft.currencies.map((currency) => (
            <ToggleRow
              key={currency.code}
              label={`${currency.flag} ${currency.label} (${currency.code})`}
              checked={currency.enabled}
              onChange={() => toggleCurrency(currency.code)}
              disabled={readOnly}
            />
          ))}
        </div>
        <SaveBar
          readOnly={readOnly}
          pending={save.isPending}
          error={save.isError ? normaliseError(save.error).message : null}
          success={save.isSuccess}
          onSave={() => save.mutate({ group: 'markets', value: draft })}
        />
      </Card>

      <Card>
        <CardHead title="Supported countries" subtitle="Markets open for signup, with their default currency and language." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                <th className="py-2 pr-4">Country</th>
                <th className="py-2 pr-4">Currency</th>
                <th className="py-2 pr-4">Language</th>
                <th className="py-2 pr-4 text-right">Enabled</th>
              </tr>
            </thead>
            <tbody>
              {draft.countries.map((country) => (
                <tr key={country.name} className="border-b border-hairline last:border-b-0">
                  <td className="py-2 pr-4 font-medium text-ink">{country.name}</td>
                  <td className="py-2 pr-4">
                    <Select
                      value={country.currency}
                      onChange={(next) => updateCountry(country.name, { currency: next as MarketsSettings['countries'][number]['currency'] })}
                      disabled={readOnly}
                      options={currencyOptions}
                      compact
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <Select
                      value={country.locale}
                      onChange={(next) => updateCountry(country.name, { locale: next as MarketsSettings['countries'][number]['locale'] })}
                      disabled={readOnly}
                      options={[
                        { value: 'en', label: 'English' },
                        { value: 'fr', label: 'French' },
                      ]}
                      compact
                    />
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <Switch
                      checked={country.enabled}
                      onChange={() => updateCountry(country.name, { enabled: !country.enabled })}
                      disabled={readOnly}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------- Verification */

function VerificationTab({ value, readOnly }: { value: VerificationSettings; readOnly: boolean }) {
  const [draft, setDraft] = useState<VerificationSettings>(value);
  const save = useSaveGroup();

  function setThreshold(key: keyof VerificationSettings['kycThresholds'], next: number) {
    setDraft((current) => ({
      ...current,
      kycThresholds: { ...current.kycThresholds, [key]: next },
    }));
  }

  return (
    <Card>
      <CardHead title="Verification & risk" subtitle="KYC auto-approval thresholds and screening controls." />
      <div className="grid gap-5 sm:grid-cols-3">
        <ThresholdField label="Confidence" value={draft.kycThresholds.confidence} onChange={(next) => setThreshold('confidence', next)} disabled={readOnly} />
        <ThresholdField label="Liveness (selfie)" value={draft.kycThresholds.selfie} onChange={(next) => setThreshold('selfie', next)} disabled={readOnly} />
        <ThresholdField label="Face match" value={draft.kycThresholds.match} onChange={(next) => setThreshold('match', next)} disabled={readOnly} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        A submission auto-approves only when all three provider scores clear their bar; otherwise it routes to manual review.
      </p>

      <Field label="Standard tier unlocked on pass" className="mt-5 max-w-xs">
        <Select
          value={String(draft.standardTier)}
          onChange={(next) => setDraft((current) => ({ ...current, standardTier: Number(next) }))}
          disabled={readOnly}
          options={[
            { value: '1', label: 'Tier 1' },
            { value: '2', label: 'Tier 2' },
            { value: '3', label: 'Tier 3' },
          ]}
        />
      </Field>

      <div className="mt-5 space-y-3">
        <ToggleRow
          label="Sanctions & PEP screening"
          hint="Screen every submission against sanctions and PEP lists at onboarding."
          checked={draft.sanctionsScreeningEnabled}
          onChange={(next) => setDraft((current) => ({ ...current, sanctionsScreeningEnabled: next }))}
          disabled={readOnly}
        />
        <ToggleRow
          label="Auto-freeze on sanctions match"
          hint="Freeze the account automatically when screening returns a match."
          checked={draft.amlAutoFreeze}
          onChange={(next) => setDraft((current) => ({ ...current, amlAutoFreeze: next }))}
          disabled={readOnly}
        />
        <ToggleRow
          label="Manual review on low confidence"
          hint="Route below-threshold submissions to the KYC review queue."
          checked={draft.manualReviewOnLowConfidence}
          onChange={(next) => setDraft((current) => ({ ...current, manualReviewOnLowConfidence: next }))}
          disabled={readOnly}
        />
        <ToggleRow
          label="Auto-approve when checks pass"
          hint="OFF (recommended): every submission waits for an operator, whatever the provider scored. ON: a passing score verifies the account with no human review."
          checked={draft.autoApproveOnPass}
          onChange={(next) => setDraft((current) => ({ ...current, autoApproveOnPass: next }))}
          disabled={readOnly}
        />
      </div>

      <SaveBar
        readOnly={readOnly}
        pending={save.isPending}
        error={save.isError ? normaliseError(save.error).message : null}
        success={save.isSuccess}
        onSave={() => save.mutate({ group: 'verification', value: draft })}
      />
    </Card>
  );
}

/* ------------------------------------------------------------- Providers */

function ProvidersTab({ value, readOnly }: { value: ProvidersSettings; readOnly: boolean }) {
  const [draft, setDraft] = useState<ProvidersSettings>(value);
  const save = useSaveGroup();

  function toggle(kind: 'kyc' | 'payments', id: string) {
    setDraft((current) => ({
      ...current,
      [kind]: current[kind].map((provider) =>
        provider.id === id ? { ...provider, enabled: !provider.enabled } : provider,
      ),
    }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHead title="Identity providers" subtitle="KYC / identity verification vendors, by region." />
        <div className="space-y-2">
          {draft.kyc.map((provider) => (
            <ToggleRow
              key={provider.id}
              label={provider.name}
              hint={provider.note}
              checked={provider.enabled}
              onChange={() => toggle('kyc', provider.id)}
              disabled={readOnly}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title="Payment gateways" subtitle="Rails available for funding escrow and paying out." />
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.payments.map((provider) => (
            <ToggleRow
              key={provider.id}
              label={provider.name}
              hint={provider.note}
              checked={provider.enabled}
              onChange={() => toggle('payments', provider.id)}
              disabled={readOnly}
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Payout automation"
          subtitle="Withdrawals are sent to the user's mobile money as soon as they ask. Only amounts above the line below wait for an operator."
        />
        <div className="space-y-4">
          <ToggleRow
            label="Pay withdrawals automatically"
            hint="Off sends every withdrawal to the approval queue, whatever the amount."
            checked={draft.payouts.automaticPayouts}
            onChange={() =>
              setDraft((current) => ({
                ...current,
                payouts: { ...current.payouts, automaticPayouts: !current.payouts.automaticPayouts },
              }))
            }
            disabled={readOnly}
          />
          <Field
            label="Approval needed above (XAF)"
            hint="Anything at or below this is paid instantly. Set 0 to pay every withdrawal without review."
          >
            <TextInput
              value={String(draft.payouts.approvalThresholdXaf)}
              onChange={(next) =>
                setDraft((current) => ({
                  ...current,
                  payouts: {
                    ...current.payouts,
                    // Digits only: this is the amount that decides whether real
                    // money leaves without a person looking at it.
                    approvalThresholdXaf: Number(next.replace(/[^0-9]/g, '')) || 0,
                  },
                }))
              }
              disabled={readOnly || !draft.payouts.automaticPayouts}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHead title="Messaging" subtitle="Transactional email and SMS providers." />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email provider">
            <TextInput value={draft.emailProvider} onChange={(next) => setDraft((current) => ({ ...current, emailProvider: next }))} disabled={readOnly} />
          </Field>
          <Field label="SMS provider">
            <TextInput value={draft.smsProvider} onChange={(next) => setDraft((current) => ({ ...current, smsProvider: next }))} disabled={readOnly} />
          </Field>
        </div>
        <SaveBar
          readOnly={readOnly}
          pending={save.isPending}
          error={save.isError ? normaliseError(save.error).message : null}
          success={save.isSuccess}
          onSave={() => save.mutate({ group: 'providers', value: draft })}
        />
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------- Legal */

function LegalTab({ documents, readOnly }: { documents: LegalDocument[]; readOnly: boolean }) {
  const [selectedType, setSelectedType] = useState<string>(documents[0]?.type ?? 'TERMS');
  const selected = documents.find((doc) => doc.type === selectedType) ?? documents[0];

  if (!selected) return <p className="text-sm text-muted-foreground">No legal documents configured.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-2 lg:col-span-2">
        {documents.map((doc) => {
          const active = doc.type === selected.type;
          return (
            <button
              key={doc.type}
              type="button"
              onClick={() => setSelectedType(doc.type)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg border p-4 text-left transition-colors',
                active
                  ? 'border-brand-400 bg-brand-50/50 ring-1 ring-brand-400'
                  : 'border-hairline bg-surface hover:bg-muted/40',
              )}
            >
              <div className="min-w-0">
                <p className="font-semibold text-ink">{doc.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">v{doc.version}</p>
              </div>
              <StatusPill published={doc.published} />
            </button>
          );
        })}
      </div>
      <div className="lg:col-span-3">
        <LegalEditor key={selected.type} document={selected} readOnly={readOnly} />
      </div>
    </div>
  );
}

function LegalEditor({ document, readOnly }: { document: LegalDocument; readOnly: boolean }) {
  const [title, setTitle] = useState(document.title);
  const [version, setVersion] = useState(document.version);
  const [content, setContent] = useState(document.content);
  const [published, setPublished] = useState(document.published);
  const save = useSaveLegal();

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardHead title={`Editing - ${document.title}`} subtitle={
          document.effectiveAt
            ? `Effective ${new Date(document.effectiveAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
            : 'Not yet published'
        } />
        <StatusPill published={published} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Title" className="sm:col-span-2">
          <TextInput value={title} onChange={setTitle} disabled={readOnly} />
        </Field>
        <Field label="Version">
          <TextInput value={version} onChange={setVersion} disabled={readOnly} />
        </Field>
      </div>

      <Field label="Content (Markdown)" className="mt-4">
        <TextArea value={content} onChange={setContent} disabled={readOnly} rows={14} mono />
      </Field>

      <div className="mt-4">
        <ToggleRow
          label="Published"
          hint="Publishing makes this the live version shown to users and stamps an effective date."
          checked={published}
          onChange={setPublished}
          disabled={readOnly}
        />
      </div>

      <SaveBar
        readOnly={readOnly}
        pending={save.isPending}
        error={save.isError ? normaliseError(save.error).message : null}
        success={save.isSuccess}
        onSave={() => save.mutate({ type: document.type, input: { title, version, content, published } })}
        label="Save document"
      />
    </Card>
  );
}

/* ------------------------------------------------------------ primitives */

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Lock className="size-6" />
      </span>
      <p className="text-sm font-semibold text-ink">No access</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        You don’t have permission to view platform settings.
      </p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {children}
    </div>
  );
}

function CardHead({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  /** One line under the control, for settings that need a word of context. */
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground"
    />
  );
}

function TextArea({
  value,
  onChange,
  disabled,
  rows = 3,
  mono,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  rows?: number;
  mono?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      rows={rows}
      className={cn(
        'w-full resize-y rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground',
        mono && 'font-mono text-[13px]',
      )}
    />
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
  compact,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className={cn(
        'w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground',
        compact ? 'h-9' : 'h-10',
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ThresholdField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          disabled={disabled}
          className="flex-1 accent-brand-600 disabled:cursor-not-allowed"
        />
        <span className="w-12 shrink-0 rounded-md bg-muted px-2 py-1 text-center text-xs font-semibold tabular-nums text-ink">
          {Math.round(value * 100)}%
        </span>
      </div>
    </Field>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  tone = 'brand',
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  tone?: 'brand' | 'danger';
}) {
  const onColor = tone === 'danger' ? 'bg-rose-500' : 'bg-brand-600';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        checked ? onColor : 'bg-slate-300',
      )}
    >
      <span
        className={cn(
          'inline-block size-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  tone,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  tone?: 'brand' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-hairline px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onChange={() => onChange(!checked)} disabled={disabled} tone={tone} />
    </div>
  );
}

function StatusPill({ published }: { published: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        published ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
      )}
    >
      {published ? <BadgeCheck className="size-3" /> : null}
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

function SaveBar({
  readOnly,
  pending,
  error,
  success,
  onSave,
  label = 'Save changes',
}: {
  readOnly: boolean;
  pending: boolean;
  error: string | null;
  success: boolean;
  onSave: () => void;
  label?: string;
}) {
  if (readOnly) return null;
  return (
    <div className="mt-6 flex items-center justify-end gap-3 border-t border-hairline pt-4">
      {error ? <p className="mr-auto text-sm text-destructive">{error}</p> : null}
      {success && !error ? <p className="mr-auto text-sm font-medium text-positive">Saved.</p> : null}
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {label}
      </button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active ? 'border-primary text-ink' : 'border-transparent text-muted-foreground hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
