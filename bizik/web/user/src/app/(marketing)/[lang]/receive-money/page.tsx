import type { Metadata } from 'next';

import { MoneyLanding, moneyMetadata } from '@/app/(marketing)/_bizik/MoneyLanding';
import { toLang } from '@/app/(marketing)/_bizik/i18n';

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  return moneyMetadata('receiveMoney', toLang((await params).lang));
}

export default async function ReceiveMoneyPage({ params }: { params: Promise<{ lang: string }> }) {
  return <MoneyLanding kind="receiveMoney" lang={toLang((await params).lang)} />;
}
