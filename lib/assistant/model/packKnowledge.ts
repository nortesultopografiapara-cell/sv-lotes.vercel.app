import type { AssistantProcedure, AssistantSafeContext } from '../types';
import type { AssistantChatTurn } from '../types';

export function packAssistantKnowledge(procedures: AssistantProcedure[], context?: AssistantSafeContext): string {
  const model = String(context?.contractModel || '').toUpperCase();
  return procedures
    .slice(0, 8)
    .map((procedure) => {
      const currentDiff = procedure.modelDifferences.find((item) => model && item.models.includes(model));
      return [
        `ID: ${procedure.id}`,
        `Título: ${procedure.title}`,
        `Módulo: ${procedure.module}`,
        `Rotas: ${procedure.routes.join(', ')}`,
        `Caminho: ${procedure.navigationPath.join(' → ')}`,
        `Objetivo: ${procedure.objective}`,
        `Passos:\n${procedure.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
        `Resultado: ${procedure.expectedResult}`,
        currentDiff ? `Diferença do modelo atual (${model}): ${currentDiff.note}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

export function packAssistantContext(context: AssistantSafeContext): string {
  const ui = context.ui;
  const lines = [
    `Rota atual: ${context.pathname}`,
    `Módulo: ${context.moduleId}`,
    `Perfil: ${context.role} (${context.roleLabel})`,
    context.tenantName ? `Empresa: ${context.tenantName}` : null,
    context.projectName ? `Empreendimento: ${context.projectName}` : null,
    context.contractModel ? `Modelo de contrato: ${context.contractModel}` : null,
    `Visão: ${context.viewer}${context.impersonatingTenant ? ' (impersonando tenant)' : ''}`,
  ];
  if (ui) {
    if (ui.blockNumber || ui.lotNumber) {
      lines.push(`Lote: Quadra ${ui.blockNumber || '—'} / Lote ${ui.lotNumber || '—'}`);
    }
    if (ui.lotStatus) lines.push(`Status do lote: ${ui.lotStatus}`);
    lines.push(`Modal do lote aberto: ${ui.lotModalOpen ? 'sim' : 'não'}`);
    if (ui.activeLotTab) lines.push(`Aba ativa do lote: ${ui.activeLotTab}`);
    lines.push(`Formulário de venda aberto: ${ui.saleFormOpen ? 'sim' : 'não'}`);
    if (ui.paymentMode) lines.push(`Forma de pagamento em preenchimento: ${ui.paymentMode}`);
    lines.push(`Cliente já selecionado na operação: ${ui.customerSelected ? 'sim' : 'não'}`);
    if (ui.contractNumber) lines.push(`Contrato selecionado: ${ui.contractNumber}`);
    if (ui.contractStatus) lines.push(`Status do contrato: ${ui.contractStatus}`);
    if (ui.signatureStatus) lines.push(`Status da assinatura: ${ui.signatureStatus}`);
    lines.push(`Assinatura eletrônica iniciada: ${ui.eSignStarted ? 'sim' : 'não'}`);
    if (ui.partyTotal != null) {
      lines.push(`Partes: ${ui.partySigned ?? 0}/${ui.partyTotal} assinadas`);
    }
    if (ui.nextAction) lines.push(`Próxima ação permitida: ${ui.nextAction}`);
    if (ui.needsRegenerar) lines.push('Contrato marcado para regenerar');
  }
  return lines.filter(Boolean).join('\n');
}

export function packHistory(history: AssistantChatTurn[]): string {
  if (history.length === 0) return '(sem histórico)';
  return history.map((item) => `${item.role === 'user' ? 'Usuário' : 'Assistente'}: ${item.text}`).join('\n');
}

export function assertPackedContextHasNoPii(packed: string): boolean {
  const lower = packed.toLowerCase();
  if (/\b(password|senha|service_role|jwt|api[_-]?key|bearer)\b/.test(lower)) return false;
  if (/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(packed)) return false;
  if (/\b(cpf|rg)\b/.test(lower)) return false;
  if (lower.includes('wallet') || lower.includes('<html') || lower.includes('generated_html')) return false;
  if (/\b(?:agencia|agência|conta)\b[:\s]*[\d.-]{4,}/i.test(packed)) return false;
  return true;
}

