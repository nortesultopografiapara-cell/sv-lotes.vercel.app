import SettingsPageClient from './SettingsPageClient';
import {
  getBankingUiDiagnostics,
  resolveBankingUiEnabled,
  shouldShowBankingUiDiagnostics,
} from '@/lib/banking/config';

/** Lê NEXT_PUBLIC em runtime (Preview Vercel) — evita bake estático da flag no build. */
export const dynamic = 'force-dynamic';

export default function SettingsPage() {
  const bankingUiEnabled = resolveBankingUiEnabled();
  const showBankingDiagnostics = shouldShowBankingUiDiagnostics();
  const bankingDiagnostics = showBankingDiagnostics
    ? getBankingUiDiagnostics(bankingUiEnabled)
    : undefined;

  return (
    <SettingsPageClient
      bankingUiEnabled={bankingUiEnabled}
      showBankingDiagnostics={showBankingDiagnostics}
      bankingDiagnostics={bankingDiagnostics}
    />
  );
}
