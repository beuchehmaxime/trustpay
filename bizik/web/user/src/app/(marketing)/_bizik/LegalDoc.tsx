import { notFound } from 'next/navigation';
import { DEFAULT_LANG, type Lang } from './i18n';

import { Breadcrumbs, Prose, formatDate } from './shared';
import { PrintButton } from './PrintButton';
import { fetchLegal } from './data';

/**
 * Shared renderer for a legal document (Terms, Privacy, Cookie, AML/KYC,
 * Dispute). Pulls the published markdown from the backend so operators can edit
 * it in the admin console; the contents list on the left is generated from the
 * document's H2 headings by BizikScripts.
 */
export async function LegalDoc({
  type,
  fallbackTitle,
  lang = DEFAULT_LANG,
}: {
  type: string;
  fallbackTitle: string;
  lang?: Lang;
}) {
  const doc = await fetchLegal(type);
  if (!doc) notFound();

  return (
    <>
      <section className="q-pagehero q-on-dark">
        <div className="q-container q-pagehero__inner">
          <Breadcrumbs lang={lang} trail={[{ label: doc.title || fallbackTitle }]} />
          <p className="q-eyebrow q-eyebrow--light">Legal</p>
          <h1 className="q-h1 q-pagehero__title">{doc.title || fallbackTitle}</h1>
          <p className="q-pagehero__text">
            Version {doc.version} · Effective {formatDate(doc.effectiveAt || doc.updatedAt)}
          </p>
          <div className="q-pagehero__cta">
            <PrintButton />
          </div>
        </div>
      </section>

      <section className="q-section q-section--lg">
        <div className="q-container q-legal">
          <aside data-toc-wrap>
            <p className="q-eyebrow q-mb-16">Contents</p>
            <nav className="q-legal__nav" data-toc aria-label="Document contents" />
          </aside>
          <Prose markdown={doc.content} tocSource />
        </div>
      </section>
    </>
  );
}
