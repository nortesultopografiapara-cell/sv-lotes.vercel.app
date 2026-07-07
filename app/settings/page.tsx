import SettingsPageClient from './SettingsPageClient';
import { logBankingUiDiagnosticsIfNeeded, resolveBankingUiEnabled } from '@/lib/banking/config';

/** Lê NEXT_PUBLIC em runtime (Preview Vercel) — evita bake estático da flag no build. */
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const bankingUiEnabled = resolveBankingUiEnabled();
  logBankingUiDiagnosticsIfNeeded(bankingUiEnabled);

  return <SettingsPageClient bankingUiEnabled={bankingUiEnabled} />;
}
