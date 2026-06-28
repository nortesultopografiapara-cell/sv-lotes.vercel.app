import { notFound } from 'next/navigation';
import { MockPaymentView } from '@/components/banking/MockPaymentView';
import { isBankingModuleEnabled } from '@/lib/banking/config';
import {
  getMockChargeDisplay,
  isMockBoletoExternalId,
} from '@/lib/banking/providers/mockBankProvider';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MockBoletoPayPage({ params }: PageProps) {
  if (!isBankingModuleEnabled()) notFound();

  const { id } = await params;
  const externalId = decodeURIComponent(id);
  if (!isMockBoletoExternalId(externalId)) notFound();

  const charge = getMockChargeDisplay(externalId, 'BOLETO');
  return <MockPaymentView charge={charge} backHref="/settings" />;
}
