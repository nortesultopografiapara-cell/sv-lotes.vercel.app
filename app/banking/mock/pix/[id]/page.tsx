import { notFound } from 'next/navigation';
import { MockPaymentView } from '@/components/banking/MockPaymentView';
import { isBankingModuleEnabled } from '@/lib/banking/config';
import {
  getMockChargeDisplay,
  isMockPixExternalId,
} from '@/lib/banking/providers/mockBankProvider';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MockPixPayPage({ params }: PageProps) {
  if (!isBankingModuleEnabled()) notFound();

  const { id } = await params;
  const externalId = decodeURIComponent(id);
  if (!isMockPixExternalId(externalId)) notFound();

  const charge = getMockChargeDisplay(externalId, 'PIX');
  return <MockPaymentView charge={charge} backHref="/settings" />;
}
