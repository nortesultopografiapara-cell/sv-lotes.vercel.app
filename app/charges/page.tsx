import { ChargesPageClient } from '@/components/charges/ChargesPageClient';
import { resolveBankingUiEnabled } from '@/lib/banking/config';
import '@/app/finance/finance-premium.css';

export default function ChargesPage() {
  return <ChargesPageClient bankingUiEnabled={resolveBankingUiEnabled()} />;
}
