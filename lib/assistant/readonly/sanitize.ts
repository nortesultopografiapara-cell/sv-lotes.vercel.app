import { sanitizeAssistantQuestion } from '../sanitize';
import type { AssistantReadonlyFacts } from './types';

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function scrub(text: string): string {
  return sanitizeAssistantQuestion(String(text || ''), 160)
    .replace(UUID_RE, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/signature_token|token_hash|service_role/gi, '')
    .trim()
    .slice(0, 80);
}

export function sanitizeReadonlyFacts(facts: AssistantReadonlyFacts): AssistantReadonlyFacts {
  if (facts.toolId === 'contract.latest_signature_status' || facts.toolId === 'contract.signature_status') {
    return {
      ...facts,
      contractNumber: facts.contractNumber ? scrub(facts.contractNumber).slice(0, 24) : null,
      pendingRoles: facts.pendingRoles.map((item) => scrub(item)).filter(Boolean).slice(0, 8),
      pendingParties: facts.pendingParties
        .map((item) => ({ name: scrub(item.name), role: scrub(item.role) }))
        .filter((item) => item.name && item.role)
        .slice(0, 8),
    };
  }
  if (facts.toolId === 'sale.latest') {
    return {
      ...facts,
      projectName: facts.projectName ? scrub(facts.projectName) : null,
      lotLabel: facts.lotLabel ? scrub(facts.lotLabel) : null,
      status: facts.status ? scrub(facts.status) : null,
    };
  }
  if (facts.toolId === 'project.inventory') {
    return {
      ...facts,
      projectName: facts.projectName ? scrub(facts.projectName) : null,
    };
  }
  return facts;
}

export function packReadonlyFacts(facts: AssistantReadonlyFacts): string {
  const clean = sanitizeReadonlyFacts(facts);
  if (clean.toolId === 'finance.overdue_summary') {
    return [
      'CONSULTA ATUAL (read-only, já sanitizada)',
      `Tool: ${clean.toolId}`,
      `Data de referência: ${clean.referenceDate}`,
      `Parcelas vencidas: ${clean.overdueCount}`,
      `Valor total em atraso: ${clean.overdueAmount}`,
      `Clientes afetados: ${clean.customerCount}`,
    ].join('\n');
  }
  if (clean.toolId === 'contract.latest_signature_status' || clean.toolId === 'contract.signature_status') {
    const parties = clean.pendingParties.map((item) => `${item.role}: ${item.name}`).join('; ') || 'nenhuma';
    return [
      'CONSULTA ATUAL (read-only, já sanitizada)',
      `Tool: ${clean.toolId}`,
      `Encontrado: ${clean.found ? 'sim' : 'não'}`,
      clean.contractNumber ? `Número operacional: ${clean.contractNumber}` : null,
      `Estado: ${clean.overallState || 'desconhecido'}`,
      `Partes: ${clean.partySigned}/${clean.partyTotal} assinadas, ${clean.partyPending} pendentes`,
      `Papéis pendentes: ${clean.pendingRoles.join(', ') || 'nenhum'}`,
      `Aguardando vendedor interno: ${clean.awaitingInternalVendor ? 'sim' : 'não'}`,
      clean.sentAt ? `Enviado em: ${clean.sentAt}` : null,
      `Pendentes (nome/papel): ${parties}`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (clean.toolId === 'sale.latest') {
    return [
      'CONSULTA ATUAL (read-only, já sanitizada)',
      `Tool: ${clean.toolId}`,
      `Encontrada: ${clean.found ? 'sim' : 'não'}`,
      clean.saleDate ? `Data: ${clean.saleDate}` : null,
      clean.status ? `Status: ${clean.status}` : null,
      clean.projectName ? `Empreendimento: ${clean.projectName}` : null,
      clean.lotLabel ? `Unidade: ${clean.lotLabel}` : null,
      clean.amount != null ? `Valor: ${clean.amount}` : 'Valor: omitido para este perfil',
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (clean.toolId === 'project.inventory') {
    return [
      'CONSULTA ATUAL (read-only, já sanitizada)',
      `Tool: ${clean.toolId}`,
      `Encontrado: ${clean.found ? 'sim' : 'não'}`,
      clean.projectName ? `Empreendimento: ${clean.projectName}` : null,
      `Disponíveis: ${clean.available}`,
      `Reservados: ${clean.reserved}`,
      `Vendidos: ${clean.sold}`,
      `Quitados: ${clean.paid}`,
      `Total: ${clean.total}`,
    ]
      .filter(Boolean)
      .join('\n');
  }
  return `CONSULTA ATUAL (read-only, já sanitizada)\nTool: ${clean.toolId}`;
}

export function packedReadonlyHasNoSecrets(packed: string): boolean {
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(packed)) {
    return false;
  }
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(packed)) return false;
  if (/service_role|api[_-]?key|password|jwt|token_hash|signature_url/i.test(packed)) return false;
  return true;
}
