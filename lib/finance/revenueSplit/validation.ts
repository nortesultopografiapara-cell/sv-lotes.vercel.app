import {
  REVENUE_SPLIT_FULL_SHARE_UNITS,
  REVENUE_SPLIT_PARTY_KINDS,
  REVENUE_SPLIT_SHARE_SCALE,
  type FinancialAccountProviderDestination,
  type ProjectRevenueSplitConfig,
  type ProjectRevenueSplitParticipant,
  type ProjectRevenueSplitParticipantInput,
  type RevenueSplitFinancialAccountRecord,
  type RevenueSplitPartyKind,
  type RevenueSplitUserRecord,
  type RevenueSplitValidationIssue,
  type RevenueSplitValidationResult,
} from './types';

export type RevenueSplitValidationMode = 'draft' | 'activate';

export type RevenueSplitValidationContext = {
  companyId: string;
  projectId: string;
  projectCompanyId: string | null;
  usersById: Record<string, RevenueSplitUserRecord | undefined>;
  accountsById: Record<string, RevenueSplitFinancialAccountRecord | undefined>;
  destinations: FinancialAccountProviderDestination[];
};

function issue(code: string, message: string): RevenueSplitValidationIssue {
  return { code, message };
}

export function isRevenueSplitPartyKind(value: string): value is RevenueSplitPartyKind {
  return (REVENUE_SPLIT_PARTY_KINDS as readonly string[]).includes(value);
}

export function toRevenueSplitShareUnits(percent: number): number {
  if (!Number.isFinite(percent)) return Number.NaN;
  return Math.round(percent * REVENUE_SPLIT_SHARE_SCALE);
}

export function sumRevenueSplitShareUnits(percents: number[]): number {
  return percents.reduce((sum, percent) => sum + toRevenueSplitShareUnits(percent), 0);
}

export function isOperationalProjectRevenueSplit(
  config: Pick<ProjectRevenueSplitConfig, 'enabled' | 'status'> | null | undefined,
): boolean {
  return Boolean(config && config.enabled && config.status === 'ACTIVE');
}

function normalizeName(value: string | null | undefined): string {
  return String(value || '').trim();
}

function activeParticipants(
  participants: Array<ProjectRevenueSplitParticipant | ProjectRevenueSplitParticipantInput>,
): Array<ProjectRevenueSplitParticipant | ProjectRevenueSplitParticipantInput> {
  return participants.filter((row) => row.active !== false);
}

function destinationForAccount(
  destinations: FinancialAccountProviderDestination[],
  companyId: string,
  financialAccountId: string,
): FinancialAccountProviderDestination | undefined {
  return destinations.find(
    (row) =>
      row.companyId === companyId &&
      row.financialAccountId === financialAccountId &&
      row.status === 'ACTIVE' &&
      String(row.destinationIdentifier || '').trim().length > 0,
  );
}

export function validateProjectRevenueSplit(
  config: Pick<ProjectRevenueSplitConfig, 'companyId' | 'projectId' | 'enabled' | 'status'> & {
    companyId: string;
    projectId: string;
  },
  participants: Array<ProjectRevenueSplitParticipant | ProjectRevenueSplitParticipantInput>,
  context: RevenueSplitValidationContext,
  mode: RevenueSplitValidationMode,
): RevenueSplitValidationResult {
  const issues: RevenueSplitValidationIssue[] = [];
  const companyId = String(config.companyId || '').trim();
  const projectId = String(config.projectId || '').trim();

  if (!companyId) issues.push(issue('COMPANY_REQUIRED', 'Empresa é obrigatória.'));
  if (!projectId) issues.push(issue('PROJECT_REQUIRED', 'Empreendimento é obrigatório.'));

  if (companyId && context.companyId && companyId !== context.companyId) {
    issues.push(issue('TENANT_MISMATCH', 'Configuração não pertence a esta empresa.'));
  }
  if (projectId && context.projectId && projectId !== context.projectId) {
    issues.push(issue('PROJECT_MISMATCH', 'Participantes não pertencem a este empreendimento.'));
  }
  if (
    companyId &&
    context.projectCompanyId &&
    context.projectCompanyId !== companyId
  ) {
    issues.push(issue('PROJECT_TENANT_MISMATCH', 'Empreendimento não pertence a esta empresa.'));
  }

  const active = activeParticipants(participants);

  for (const [index, row] of participants.entries()) {
    const name = normalizeName(row.displayName);
    if (!name) {
      issues.push(issue('DISPLAY_NAME_REQUIRED', `Participante ${index + 1} precisa de nome.`));
    }
    if (!isRevenueSplitPartyKind(String(row.partyKind || ''))) {
      issues.push(issue('PARTY_KIND_INVALID', `Participante ${index + 1} tem tipo inválido.`));
    }

    const percent = Number(row.sharePercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
      issues.push(
        issue(
          'SHARE_PERCENT_RANGE',
          `Participante ${index + 1}: percentual deve ser maior que 0 e no máximo 100.`,
        ),
      );
    }

    const userId = row.userId ? String(row.userId).trim() : '';
    if (userId) {
      const user = context.usersById[userId];
      if (!user) {
        issues.push(issue('USER_NOT_FOUND', `Participante ${index + 1}: usuário não encontrado.`));
      } else if (user.companyId !== companyId) {
        issues.push(issue('USER_TENANT_MISMATCH', 'Não é permitido vincular usuário de outra empresa.'));
      }
    }

    const accountId = row.financialAccountId ? String(row.financialAccountId).trim() : '';
    if (accountId) {
      const account = context.accountsById[accountId];
      if (!account) {
        issues.push(
          issue('FINANCIAL_ACCOUNT_NOT_FOUND', `Participante ${index + 1}: conta financeira não encontrada.`),
        );
      } else if (account.companyId !== companyId) {
        issues.push(
          issue('FINANCIAL_ACCOUNT_TENANT_MISMATCH', 'Não é permitido usar conta financeira de outra empresa.'),
        );
      }
    }
  }

  const remainderCount = active.filter((row) => row.isIssuerRemainder).length;
  if (mode === 'draft' && remainderCount > 1) {
    issues.push(issue('MULTIPLE_ISSUER_REMAINDER', 'Deve existir no máximo um participante emissor (resto).'));
  }

  if (mode === 'activate') {
    if (active.length === 0) {
      issues.push(issue('PARTICIPANTS_REQUIRED', 'Configuração ativa precisa de participantes ativos.'));
    }
    if (remainderCount !== 1) {
      issues.push(
        issue(
          remainderCount === 0 ? 'ISSUER_REQUIRED' : 'MULTIPLE_ISSUER_REMAINDER',
          remainderCount === 0
            ? 'Deve existir exatamente um participante emissor (resto).'
            : 'Deve existir exatamente um participante emissor (resto).',
        ),
      );
    }

    const shareUnits = sumRevenueSplitShareUnits(active.map((row) => Number(row.sharePercent)));
    if (active.length > 0 && shareUnits !== REVENUE_SPLIT_FULL_SHARE_UNITS) {
      issues.push(
        issue(
          shareUnits < REVENUE_SPLIT_FULL_SHARE_UNITS ? 'SHARE_SUM_BELOW_100' : 'SHARE_SUM_ABOVE_100',
          'A soma dos percentuais ativos deve ser exatamente 100%.',
        ),
      );
    }

    for (const [index, row] of active.entries()) {
      if (row.isIssuerRemainder) continue;
      const accountId = row.financialAccountId ? String(row.financialAccountId).trim() : '';
      if (!accountId) {
        issues.push(
          issue(
            'DESTINATION_ACCOUNT_REQUIRED',
            `Participante ${index + 1}: não-emissor precisa de conta financeira ao ativar.`,
          ),
        );
        continue;
      }
      const dest = destinationForAccount(context.destinations, companyId, accountId);
      if (!dest) {
        issues.push(
          issue(
            'DESTINATION_REQUIRED',
            `Participante ${index + 1}: não-emissor precisa de destino financeiro válido (ex.: walletId) ao ativar.`,
          ),
        );
      } else if (dest.companyId !== companyId) {
        issues.push(issue('DESTINATION_TENANT_MISMATCH', 'Destino financeiro de outra empresa não é permitido.'));
      }
    }
  }

  return { ok: issues.length === 0, issues };
}
