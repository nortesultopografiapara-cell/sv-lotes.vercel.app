/**
 * Homologação futura da RLS de finance_receipts.
 * Nesta fase o script para antes de abrir qualquer conexão.
 * npx tsx scripts/develop/finance-receipts-rls-homolog.ts
 */
import { financeRlsHomologBlockReason } from '../../lib/security/financeReceiptRlsHomologPlan';

const reason = financeRlsHomologBlockReason(process.env);
if (reason) {
  console.log(JSON.stringify({ executed: false, reason, writes: 0 }));
  process.exit(0);
}

throw new Error('Homologação autorizada ainda não está ligada a um executor de banco.');
