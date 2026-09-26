import { knowledgeStepStillNeeded } from '../composeFromUi';
import type { AssistantChatTurn, AssistantProcedure, AssistantSafeContext } from '../types';

export function packAssistantKnowledge(procedures: AssistantProcedure[], context?: AssistantSafeContext): string {
  const model = String(context?.contractModel || '').toUpperCase();
  const priority =
    context?.ui?.contractId || context?.ui?.saleFormOpen || context?.ui?.lotModalOpen
      ? 'PRIORIDADE: o ESTADO DA INTERFACE vale mais que a navegação abaixo. Não mande o usuário abrir uma tela em que ele já está.'
      : '';
  return [priority, ...procedures.slice(0, 8).map((procedure) => {
      const currentDiff = procedure.modelDifferences.find((item) => model && item.models.includes(model));
      const steps = context
        ? procedure.steps.filter((step) => knowledgeStepStillNeeded(step, context))
        : procedure.steps;
      const onContracts = Boolean(context?.ui?.contractId || context?.pathname?.startsWith('/contracts'));
      return [
        `ID: ${procedure.id}`,
        `Título: ${procedure.title}`,
        `Módulo: ${procedure.module}`,
        `Rotas: ${procedure.routes.join(', ')}`,
        onContracts
          ? 'Caminho: usuário já está em Contratos — não repetir navegação'
          : `Caminho: ${procedure.navigationPath.join(' → ')}`,
        `Objetivo: ${procedure.objective}`,
        `Passos:\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
        `Resultado: ${procedure.expectedResult}`,
        currentDiff ? `Diferença do modelo atual (${model}): ${currentDiff.note}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

export function packAssistantContext(
  context: AssistantSafeContext,
  extras?: { activeGoal?: { id: string; label: string } | null },
): string {
  const ui = context.ui;
  const lines = [
    'ESTADO DA INTERFACE (prioridade sobre a KB genérica)',
    `Rota atual: ${context.pathname}`,
    `Módulo: ${context.moduleId}`,
    `Perfil: ${context.role} (${context.roleLabel})`,
    context.tenantName ? `Empresa: ${context.tenantName}` : null,
    context.projectName ? `Empreendimento: ${context.projectName}` : null,
    context.contractModel ? `Modelo de contrato: ${context.contractModel}` : null,
    `Visão: ${context.viewer}${context.impersonatingTenant ? ' (impersonando tenant)' : ''}`,
  ];
  if (extras?.activeGoal) {
    lines.push(`Objetivo da conversa: ${extras.activeGoal.label}`);
    lines.push(
      'O objetivo da conversa não é o estado da tela. Continue esse objetivo até o usuário mudar de assunto. Não volte para venda/reserva só porque o lote está aberto.',
    );
  }
  if (ui) {
    if (ui.blockNumber || ui.lotNumber) {
      lines.push(`Lote: Quadra ${ui.blockNumber || '—'} / Lote ${ui.lotNumber || '—'}`);
    }
    if (ui.lotStatus) lines.push(`Status do lote: ${ui.lotStatus}`);
    lines.push(`Modal do lote aberto: ${ui.lotModalOpen ? 'sim' : 'não'}`);
    if (ui.activeLotTab) lines.push(`Aba ativa do lote: ${ui.activeLotTab}`);
    lines.push(`Formulário de venda/reserva aberto: ${ui.saleFormOpen ? 'sim' : 'não'}`);
    if (ui.paymentMode) lines.push(`Forma de pagamento em preenchimento: ${ui.paymentMode}`);
    lines.push(`Cliente já selecionado na operação: ${ui.customerSelected ? 'sim' : 'não'}`);
    if (ui.saleFormOpen) {
      lines.push(`Quantidade de parcelas preenchida: ${ui.installmentsFilled ? 'sim' : 'não'}`);
      lines.push(`Primeiro vencimento preenchido: ${ui.firstDueFilled ? 'sim' : 'não'}`);
      lines.push(`Corretor selecionado: ${ui.brokerSelected ? 'sim' : 'não'}`);
      lines.push(`Sinal informado: ${ui.downPaymentFilled ? 'sim' : 'não'}`);
    }
    lines.push(`Contrato selecionado nesta tela: ${ui.contractId ? 'sim' : 'não'}`);
    if (ui.contractNumber) lines.push(`Identificador operacional do contrato: ${ui.contractNumber}`);
    if (ui.contractStatus) lines.push(`Status do contrato: ${ui.contractStatus}`);
    if (ui.signatureStatus) lines.push(`Status da assinatura: ${ui.signatureStatus}`);
    lines.push(`Assinatura eletrônica iniciada: ${ui.eSignStarted ? 'sim' : 'não'}`);
    if (ui.partyTotal != null) {
      lines.push(`Partes: ${ui.partySigned ?? 0}/${ui.partyTotal} assinadas`);
    }
    if (ui.pendingExternal != null) lines.push(`Assinaturas externas pendentes: ${ui.pendingExternal}`);
    if (ui.pendingInternalVendor) lines.push('Assinatura interna de vendedor pendente: sim');
    if (ui.pendingPartyRoles.length > 0) {
      lines.push(`Papéis pendentes (sem PII): ${ui.pendingPartyRoles.join(', ')}`);
    }
    if (ui.nextAction) lines.push(`Próxima ação permitida: ${ui.nextAction}`);
    if (ui.needsRegenerar) lines.push('Contrato marcado para regenerar');
    if (ui.contractId || ui.saleFormOpen || ui.lotModalOpen) {
      lines.push('Não peça para navegar até a tela atual nem localizar o mesmo registro.');
    }
    lines.push(
      'O histórico da conversa não substitui este estado. Ignore venda, cliente, lote ou contrato que não estejam neste snapshot.',
    );
  }
  return lines.filter(Boolean).join('\n');
}

export function packHistory(history: AssistantChatTurn[]): string {
  if (history.length === 0) return '(sem histórico)';
  return [
    'HISTÓRICO (memória de conversa; não é o estado atual da interface)',
    ...history.map((item) => `${item.role === 'user' ? 'Usuário' : 'Assistente'}: ${item.text}`),
  ].join('\n');
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
