import { LegalDocType } from '@prisma/client';

import { prisma } from './prisma';

const TERMS = `# BiZik Terms & Conditions

_Last updated: on publication_

## 1. Introduction
Welcome to BiZik. These Terms & Conditions govern your access to and use of the
BiZik platform, which provides escrow-secured contracting and cross-border
payments between clients and freelancers.

## 2. Accounts
You must provide accurate information and complete identity verification (KYC)
where required. You are responsible for keeping your credentials secure.

## 3. Escrow & Payments
Funds committed to a project are held in a segregated escrow account and released
to the freelancer as milestones are approved, or refunded to the client where
terms provide. Platform fees apply at funding and release as disclosed at
checkout.

## 4. Disputes
Where the parties cannot agree, either side may open a dispute. BiZik may
mediate and issue a binding resolution (release, refund or split) in accordance
with the evidence submitted.

## 5. Prohibited Conduct
Moving payments off-platform, fraud, money laundering, and abusive behaviour are
strictly prohibited and may result in suspension and reporting to authorities.

## 6. Liability
BiZik provides the platform "as is" to the fullest extent permitted by law.

## 7. Contact
Questions about these terms can be sent to our support team.`;

const PRIVACY = `# BiZik Privacy Policy

_Last updated: on publication_

## 1. Data We Collect
We collect account details, identity verification documents, transaction records
and usage data needed to operate the platform and meet our legal obligations.

## 2. How We Use Data
To provide the service, verify identity, prevent fraud and money laundering,
process payments, and comply with regulatory requirements.

## 3. Sharing
We share data with identity verification, payment and sanctions-screening
providers, and with regulators where required by law.

## 4. Retention
We retain records for as long as necessary to provide the service and meet
legal, tax and anti-money-laundering obligations.

## 5. Your Rights
Subject to applicable law, you may request access to, correction of, or deletion
of your personal data.

## 6. Security
Sensitive data is encrypted at rest and in transit. Access is restricted on a
need-to-know basis.

## 7. Contact
Privacy questions can be sent to our support team.`;

const AML_POLICY = `# BiZik AML & Sanctions Policy

BiZik operates a risk-based Anti-Money-Laundering (AML) programme. All users are
screened against sanctions and PEP lists at onboarding and on an ongoing basis.
Suspicious activity is investigated and may be escalated to a Suspicious Activity
Report (SAR). Accounts matching sanctions lists are frozen pending review.`;

const COOKIE = `# BiZik Cookie Policy

We use strictly necessary cookies to keep you signed in and secure the platform,
and analytics cookies (where permitted) to improve the service. You can control
non-essential cookies through your browser settings.`;

const ACCEPTABLE_USE = `# BiZik Acceptable Use Policy

You agree not to misuse the platform, including by attempting to move payments
off-platform, harassing other users, uploading malicious content, or using the
service for any unlawful purpose. Violations may result in message removal,
suspension or account closure.`;

const DEFAULT_DOCS: { type: LegalDocType; title: string; content: string; published: boolean }[] = [
  { type: 'TERMS', title: 'Terms & Conditions', content: TERMS, published: true },
  { type: 'PRIVACY', title: 'Privacy Policy', content: PRIVACY, published: true },
  { type: 'AML_POLICY', title: 'AML & Sanctions Policy', content: AML_POLICY, published: true },
  { type: 'COOKIE', title: 'Cookie Policy', content: COOKIE, published: false },
  { type: 'ACCEPTABLE_USE', title: 'Acceptable Use Policy', content: ACCEPTABLE_USE, published: false },
];

/** Upsert the built-in legal documents (never clobbers operator edits). */
export async function seedLegalDocuments(): Promise<void> {
  for (const doc of DEFAULT_DOCS) {
    await prisma.legalDocument.upsert({
      where: { type: doc.type },
      update: {},
      create: {
        type: doc.type,
        title: doc.title,
        content: doc.content,
        published: doc.published,
        effectiveAt: doc.published ? new Date() : null,
      },
    });
  }
}
