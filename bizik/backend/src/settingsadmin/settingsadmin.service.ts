import { LegalDocType, LegalDocument, Prisma } from '@prisma/client';

import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import {
  SettingsGroup,
  refreshSystemSettings,
  systemSettings,
} from '../lib/system-settings';
import { SettingsAdminRepository } from './settingsadmin.repository';
import { GROUP_SCHEMAS, LegalUpdateInput } from './settingsadmin.validation';

function legalDto(doc: LegalDocument, updatedByName?: string) {
  return {
    type: doc.type,
    title: doc.title,
    content: doc.content,
    version: doc.version,
    published: doc.published,
    effectiveAt: doc.effectiveAt ? doc.effectiveAt.toISOString() : null,
    updatedAt: doc.updatedAt.toISOString(),
    updatedBy: updatedByName ?? null,
  };
}

export const SettingsAdminService = {
  /** All setting groups (effective values from cache) + the legal document list. */
  async overview() {
    const settings = systemSettings();
    const docs = await SettingsAdminRepository.listLegal();
    const actorIds = [...new Set(docs.map((doc) => doc.updatedById).filter(Boolean))] as string[];
    const actors = await SettingsAdminRepository.actorNames(actorIds);
    const nameById = new Map(actors.map((actor) => [actor.id, actor.fullName]));
    return {
      general: settings.general,
      markets: settings.markets,
      verification: settings.verification,
      providers: settings.providers,
      legal: docs.map((doc) =>
        legalDto(doc, doc.updatedById ? nameById.get(doc.updatedById) : undefined),
      ),
    };
  },

  /** Validate + persist one settings group, refresh the cache, and audit it. */
  async updateGroup(actorId: string, group: string, body: unknown) {
    if (!(group in GROUP_SCHEMAS)) {
      throw new AppError(404, 'Q-404', 'Unknown settings group.');
    }
    const schema = GROUP_SCHEMAS[group as SettingsGroup];
    const value = schema.parse(body);
    const before = systemSettings()[group as SettingsGroup];
    await SettingsAdminRepository.upsertGroup(group, value as Prisma.InputJsonValue, actorId);
    await refreshSystemSettings();
    void recordAudit({
      actorId,
      action: 'settings.update',
      entityType: 'SystemSetting',
      entityId: group,
      before,
      after: value,
    });
    return this.overview();
  },

  // ---- Legal documents ----

  async legal(type: LegalDocType) {
    const doc = await SettingsAdminRepository.getLegal(type);
    if (!doc) throw new AppError(404, 'Q-404', 'Legal document not found.');
    return legalDto(doc);
  },

  async updateLegal(actorId: string, type: LegalDocType, input: LegalUpdateInput) {
    const existing = await SettingsAdminRepository.getLegal(type);
    if (!existing) throw new AppError(404, 'Q-404', 'Legal document not found.');
    // Publishing (or a version bump) stamps a fresh effective date.
    const nowPublishing = input.published && (!existing.published || existing.version !== input.version);
    const updated = await SettingsAdminRepository.updateLegal(type, {
      title: input.title,
      content: input.content,
      version: input.version,
      published: input.published,
      effectiveAt: nowPublishing ? new Date() : existing.effectiveAt,
      updatedById: actorId,
    });
    void recordAudit({
      actorId,
      action: 'settings.legal.update',
      entityType: 'LegalDocument',
      entityId: type,
      before: { version: existing.version, published: existing.published },
      after: { version: input.version, published: input.published },
    });
    return legalDto(updated);
  },
};
