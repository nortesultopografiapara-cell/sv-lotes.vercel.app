/**
 * Políticas puras — exclusão segura do Financeiro Corporativo / Topografia Master.
 * Sem I/O. Escopo exclusivo /master/** (nunca SaaS/tenant).
 */

export const CORPORATE_SECURE_DELETE_CONFIRM_WORD = 'EXCLUIR' as const;

export const CORPORATE_SECURE_DELETE_SCOPE_NOTICE =
  'Esta ação excluirá o registro selecionado e os vínculos corporativos correspondentes. Nenhum dado do Caixa SaaS ou das empresas clientes será alterado.';

/** Origens de caixa que podem ser excluídas diretamente pelo Fluxo de Caixa. */
export const CORPORATE_CASH_MANUAL_DELETE_ORIGINS = [
  'MANUAL_INCOME',
  'MANUAL_EXPENSE',
] as const;

export type CorporateCashManualDeleteOrigin =
  (typeof CORPORATE_CASH_MANUAL_DELETE_ORIGINS)[number];

export function normalizeSecureDeleteConfirmWord(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function assertSecureDeleteConfirmWord(value: string | null | undefined): void {
  if (normalizeSecureDeleteConfirmWord(value) !== CORPORATE_SECURE_DELETE_CONFIRM_WORD) {
    throw new Error(
      `Confirmação inválida. Digite exatamente ${CORPORATE_SECURE_DELETE_CONFIRM_WORD} para continuar.`,
    );
  }
}

/** Somente SUPER_ADMIN (e não outros papéis Master/empresa). */
export function canExecuteCorporateSecureDelete(role: string | null | undefined): boolean {
  return String(role || '').trim().toUpperCase() === 'SUPER_ADMIN';
}

export function assertCanExecuteCorporateSecureDelete(role: string | null | undefined): void {
  if (!canExecuteCorporateSecureDelete(role)) {
    throw new Error('Exclusão corporativa restrita a SUPER_ADMIN.');
  }
}

export function isManualCorporateCashOrigin(origin: string | null | undefined): boolean {
  const o = String(origin || '').trim().toUpperCase();
  return (CORPORATE_CASH_MANUAL_DELETE_ORIGINS as readonly string[]).includes(o);
}

export function corporateCashDerivedDeleteBlockMessage(origin: string): string {
  return (
    'Este lançamento foi gerado por uma Conta a Receber, Conta a Pagar ou cobrança Asaas. ' +
    'Para removê-lo corretamente, exclua ou estorne o registro de origem.' +
    (origin ? ` (origem: ${origin})` : '')
  );
}

export type ProjectDeleteLinkSummary = {
  receivables: number;
  payables: number;
  quotes: number;
  cashMovements: number;
  costCenters: number;
  asaasCharges: number;
};

export function projectDeleteHasLinks(links: ProjectDeleteLinkSummary): boolean {
  return (
    links.receivables > 0 ||
    links.payables > 0 ||
    links.quotes > 0 ||
    links.cashMovements > 0 ||
    links.costCenters > 0 ||
    links.asaasCharges > 0
  );
}

export function formatProjectDeleteLinks(links: ProjectDeleteLinkSummary): string[] {
  const lines: string[] = [];
  if (links.receivables) lines.push(`${links.receivables} conta(s) a receber`);
  if (links.payables) lines.push(`${links.payables} conta(s) a pagar`);
  if (links.quotes) lines.push(`${links.quotes} orçamento(s)`);
  if (links.cashMovements) lines.push(`${links.cashMovements} movimentação(ões)`);
  if (links.costCenters) lines.push(`${links.costCenters} centro(s) de resultado`);
  if (links.asaasCharges) lines.push(`${links.asaasCharges} cobrança(s) Asaas`);
  return lines;
}

/** Tabelas/prefixos que NUNCA podem ser alvo destas rotinas. */
export const FORBIDDEN_SECURE_DELETE_TABLE_PREFIXES = [
  'master_saas_',
  'company_',
  'finance_receipts',
  'cash_movements', // caixa tenant (sem master_corporate_)
  'saas_',
] as const;

export function assertCorporateTableName(table: string): void {
  const t = String(table || '');
  if (!t.startsWith('master_corporate_') && !t.startsWith('master_topography_')) {
    throw new Error(`Tabela fora do escopo corporativo/topografia: ${t}`);
  }
  for (const bad of FORBIDDEN_SECURE_DELETE_TABLE_PREFIXES) {
    if (t === bad || t.startsWith(bad)) {
      throw new Error(`Tabela proibida na exclusão corporativa: ${t}`);
    }
  }
}
