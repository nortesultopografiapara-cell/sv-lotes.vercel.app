import type { MasterCorporateArApListFilters } from './arApTypes';

export function parseArApListFilters(searchParams: URLSearchParams): MasterCorporateArApListFilters {
  const dateFieldRaw = searchParams.get('dateField') || 'due_date';
  const allowed = ['due_date', 'issue_date', 'competence_date', 'created_at'] as const;
  const dateField = (allowed as readonly string[]).includes(dateFieldRaw)
    ? (dateFieldRaw as MasterCorporateArApListFilters['dateField'])
    : 'due_date';

  return {
    q: searchParams.get('q') || undefined,
    status: searchParams.get('status') || undefined,
    projectId: searchParams.get('projectId') || undefined,
    quoteId: searchParams.get('quoteId') || undefined,
    categoryId: searchParams.get('categoryId') || undefined,
    costCenterId: searchParams.get('costCenterId') || undefined,
    financialAccountId: searchParams.get('financialAccountId') || undefined,
    overdueOnly: searchParams.get('overdueOnly') === '1',
    includeArchived: searchParams.get('includeArchived') === '1',
    fromDate: searchParams.get('fromDate') || undefined,
    toDate: searchParams.get('toDate') || undefined,
    dateField,
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 20),
  };
}

export function httpStatusFromMessage(message: string): number {
  if (
    message.includes('Saldo não provisionado') ||
    message.includes('Justificativa') ||
    message.includes('obrigatório') ||
    message.includes('inválid') ||
    message.includes('maior que') ||
    message.includes('não pode') ||
    message.includes('duplicado') ||
    message.includes('Somente orçamento') ||
    message.includes('menor que')
  ) {
    return 400;
  }
  if (message.includes('não encontrado')) return 404;
  if (message.includes('já ') || message.includes('Já ')) return 409;
  return 500;
}
