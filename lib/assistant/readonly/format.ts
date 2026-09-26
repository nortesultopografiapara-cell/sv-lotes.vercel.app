import { ASSISTANT_CONTINUE_OFFER, ASSISTANT_FORBIDDEN_BROKER } from '../constants';
import type { AssistantReadonlyExecution, AssistantReadonlyFacts } from './types';

function brl(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function datePt(iso: string | null): string {
  if (!iso) return '';
  const day = iso.slice(0, 10);
  const [y, m, d] = day.split('-');
  if (!y || !m || !d) return day;
  return `${d}/${m}/${y}`;
}

export function formatReadonlyFacts(facts: AssistantReadonlyFacts): string {
  if (facts.toolId === 'finance.overdue_summary') {
    const ref = datePt(facts.referenceDate);
    if (facts.overdueCount <= 0) {
      return `Não. Não há parcelas vencidas na data de referência (${ref}). ${ASSISTANT_CONTINUE_OFFER}`;
    }
    return `Sim. Existem ${facts.overdueCount} parcela${facts.overdueCount === 1 ? '' : 's'} vencida${facts.overdueCount === 1 ? '' : 's'}, totalizando ${brl(facts.overdueAmount)}, de ${facts.customerCount} cliente${facts.customerCount === 1 ? '' : 's'}. Referência: ${ref}. ${ASSISTANT_CONTINUE_OFFER}`;
  }

  if (facts.toolId === 'contract.latest_signature_status' || facts.toolId === 'contract.signature_status') {
    if (!facts.found) {
      return `Não encontrei contrato enviado para assinatura nesta empresa. ${ASSISTANT_CONTINUE_OFFER}`;
    }
    const prefix = facts.toolId === 'contract.latest_signature_status' ? `O último contrato enviado${facts.contractNumber ? ` (${facts.contractNumber})` : ''}` : `Neste contrato${facts.contractNumber ? ` (${facts.contractNumber})` : ''}`;
    if (facts.overallState === 'assinado' || (facts.partyTotal > 0 && facts.partyPending === 0 && facts.partySigned >= facts.partyTotal)) {
      return `Sim. ${prefix} já está assinado por todas as partes (${facts.partySigned}/${facts.partyTotal}). ${ASSISTANT_CONTINUE_OFFER}`;
    }
    if (facts.overallState === 'cancelado') {
      return `${prefix} está cancelado. ${ASSISTANT_CONTINUE_OFFER}`;
    }
    const pending =
      facts.pendingParties.length > 0
        ? facts.pendingParties.map((item) => `${item.role} (${item.name})`).join(', ')
        : facts.pendingRoles.join(', ') || 'partes pendentes';
    const vendor = facts.awaitingInternalVendor ? ' Ainda falta a assinatura interna do vendedor.' : '';
    const sent = facts.sentAt ? ` Enviado em ${datePt(facts.sentAt)}.` : '';
    return `Ainda não. ${prefix} está aguardando assinatura (${facts.partySigned}/${facts.partyTotal}). Faltam: ${pending}.${vendor}${sent} ${ASSISTANT_CONTINUE_OFFER}`;
  }

  if (facts.toolId === 'sale.latest') {
    if (!facts.found) {
      return `Não encontrei venda visível para o seu perfil. ${ASSISTANT_CONTINUE_OFFER}`;
    }
    const bits = [
      facts.saleDate ? `em ${datePt(facts.saleDate)}` : null,
      facts.lotLabel,
      facts.projectName ? `no ${facts.projectName}` : null,
      facts.status ? `status ${facts.status}` : null,
      facts.amount != null ? brl(facts.amount) : null,
    ].filter(Boolean);
    return `Sua última venda ${bits.join(', ')}. ${ASSISTANT_CONTINUE_OFFER}`;
  }

  if (facts.toolId === 'project.inventory') {
    if (!facts.found) {
      return `Não encontrei o empreendimento para consultar o estoque. ${ASSISTANT_CONTINUE_OFFER}`;
    }
    return `No ${facts.projectName || 'empreendimento'} há ${facts.available} lote${facts.available === 1 ? '' : 's'} disponível${facts.available === 1 ? '' : 'eis'}, ${facts.reserved} reservado${facts.reserved === 1 ? '' : 's'}, ${facts.sold} vendido${facts.sold === 1 ? '' : 's'} e ${facts.paid} quitado${facts.paid === 1 ? '' : 's'} (${facts.total} no total). ${ASSISTANT_CONTINUE_OFFER}`;
  }

  return 'Não consegui concluir essa consulta agora. Não inventei valores. Tente de novo em instantes.';
}

export function formatReadonlyFailure(execution: Extract<AssistantReadonlyExecution, { ok: false }>): string {
  if (execution.reason === 'forbidden' && execution.forbiddenReason === 'broker') {
    return ASSISTANT_FORBIDDEN_BROKER;
  }
  if (execution.reason === 'forbidden') {
    return 'Seu perfil não tem permissão para essa consulta.';
  }
  if (execution.reason === 'no_tenant') {
    return 'Não foi possível identificar a empresa para consultar os dados.';
  }
  return 'Não consegui concluir essa consulta agora. Não inventei valores. Tente de novo em instantes.';
}

export function readonlyFactsRespected(text: string, facts: AssistantReadonlyFacts): boolean {
  if (facts.toolId === 'finance.overdue_summary' && facts.overdueCount > 0) {
    return text.includes(String(facts.overdueCount));
  }
  if (
    (facts.toolId === 'contract.latest_signature_status' || facts.toolId === 'contract.signature_status') &&
    facts.found &&
    facts.partyTotal > 0
  ) {
    return text.includes(String(facts.partyTotal)) || text.includes(`${facts.partySigned}/${facts.partyTotal}`);
  }
  if (facts.toolId === 'project.inventory' && facts.found) {
    return text.includes(String(facts.available));
  }
  return text.trim().length > 12;
}
