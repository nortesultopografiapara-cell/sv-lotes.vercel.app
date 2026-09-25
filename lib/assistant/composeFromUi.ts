import { ASSISTANT_CONTINUE_OFFER } from './constants';
import type { AssistantSafeContext } from './types';
import type { AssistantUiSafeState } from './uiSnapshot';

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isAssistantNowQuestion(question: string): boolean {
  const n = normalize(question);
  return (
    /o que (faco|falta)|e agora|proximo passo|proxima acao|vender este lote|falta neste contrato/.test(
      n,
    ) || /quem (precisa |deve |tem que )?assin/.test(n)
  );
}

function uiLead(context: AssistantSafeContext): string {
  const ui = context.ui;
  const parts: string[] = [];
  if (ui.lotNumber || ui.blockNumber) {
    const lot = ui.lotNumber ? `Lote ${ui.lotNumber}` : 'este lote';
    const block = ui.blockNumber ? ` da Quadra ${ui.blockNumber}` : '';
    const project = context.projectName ? ` do ${context.projectName}` : '';
    const status = ui.lotStatus ? ` e ele está ${ui.lotStatus.toLowerCase()}` : '';
    parts.push(`Você está no ${lot}${block}${project}${status}.`);
  } else if (ui.saleFormOpen) {
    parts.push('O formulário da operação está aberto.');
  } else if (ui.contractId || context.pathname.startsWith('/contracts')) {
    parts.push('Você já está em Contratos.');
  } else if (context.pathname.startsWith('/map')) {
    parts.push('Você já está no Mapa GIS.');
  }
  return parts.length ? `${parts.join(' ')} ` : '';
}

function saleNext(ui: AssistantUiSafeState): string | null {
  if (!ui.saleFormOpen) return null;
  if (!ui.customerSelected) {
    return 'Busque ou cadastre o cliente nesta operação. Depois escolha a forma de pagamento.';
  }
  if (ui.paymentMode === 'parcelado') {
    if (!ui.installmentsFilled) {
      return 'O cliente já está selecionado. Em Parcelado, informe a quantidade de parcelas.';
    }
    if (!ui.firstDueFilled) {
      return 'Informe o primeiro vencimento das parcelas.';
    }
    if (!ui.downPaymentFilled) {
      return 'Confira o sinal, se houver, e o corretor. Depois Confirmar Venda.';
    }
    if (!ui.brokerSelected) {
      return 'Se houver corretor nesta venda, selecione-o. Depois Confirmar Venda.';
    }
    return 'Revise os valores do Parcelado e clique em Confirmar Venda.';
  }
  return 'Em Forma de Pagamento, escolha À vista ou Parcelado e confira os valores antes de Confirmar Venda.';
}

function contractNext(context: AssistantSafeContext): string | null {
  const ui = context.ui;
  if (!ui.contractId) return null;
  const model = String(context.contractModel || ui.contractModel || '').toUpperCase();
  const lf = model === 'ESTRELA_DO_SUL';
  const generated =
    Boolean(ui.contractStatus) || ui.needsRegenerar || Boolean(ui.contractNumber);

  if (ui.needsRegenerar) {
    return 'Este contrato precisa ser regenerado antes de seguir. Use Regenerar contrato nesta mesma tela.';
  }
  if (['cancelado', 'cancelled', 'canceled', 'superseded'].includes(String(ui.contractStatus || '').toLowerCase())) {
    return 'Este contrato está encerrado. Nesta tela você só consulta o histórico.';
  }
  if (
    String(ui.signatureStatus || '').toUpperCase() === 'SIGNED' ||
    String(ui.contractStatus || '').toLowerCase() === 'assinado'
  ) {
    return 'Este contrato já está assinado. Não há envio pendente.';
  }
  if (!ui.eSignStarted) {
    const gerado = generated ? 'já está gerado, mas ainda não foi enviado para assinatura' : 'ainda não foi enviado para assinatura';
    return `Este contrato ${gerado}. O próximo passo é clicar em Enviar para assinatura.`;
  }

  const pendingExternal = ui.pendingExternal ?? Math.max(0, (ui.partyTotal ?? 0) - (ui.partySigned ?? 0));
  const pendingRoles = (ui.pendingPartyRoles || []).filter(Boolean);
  const parties =
    ui.partyTotal != null ? ` Partes: ${ui.partySigned ?? 0}/${ui.partyTotal}.` : '';

  if (pendingExternal > 0) {
    return `Este contrato está aguardando ${pendingExternal} assinatura${pendingExternal === 1 ? '' : 's'} externa${pendingExternal === 1 ? '' : 's'}.${parties} Acompanhar assinaturas ou reenviar os links individuais nesta mesma tela.`;
  }

  if (ui.pendingInternalVendor) {
    const button = lf ? 'Assinar promitente vendedor' : 'Assinar como vendedor';
    const lfHint = lf
      ? ' Falta a assinatura interna da LF Imóveis. Confirme com a autorização do Administrador Principal.'
      : ' Falta a assinatura interna do vendedor.';
    return `As assinaturas externas já foram concluídas.${lfHint} Use ${button}.`;
  }

  if (pendingRoles.length > 0) {
    return `Ainda faltam partes nesta tela (${pendingRoles.join(', ')}).${parties} Acompanhe o status na seção de assinatura.`;
  }

  if (ui.nextAction) {
    return `Próxima ação nesta tela: ${ui.nextAction}.${parties}`;
  }
  return `Contrato selecionado nesta tela.${parties} Acompanhe a seção de assinatura.`;
}

/**
 * Resposta a partir do estado real validado.
 * Tem prioridade sobre passos genéricos da KB (ex.: "Abra Contratos").
 */
export function composeFromValidatedUi(input: {
  question: string;
  context: AssistantSafeContext;
}): string | null {
  if (!isAssistantNowQuestion(input.question)) return null;
  const ui = input.context.ui;
  const lead = uiLead(input.context);

  if (ui.saleFormOpen) {
    const next = saleNext(ui);
    if (next) return `${lead}${next} ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
  }

  if (ui.contractId) {
    const next = contractNext(input.context);
    if (next) return `${lead}${next} ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
  }

  if (ui.lotModalOpen && ui.activeLotTab === 'comercial' && !ui.saleFormOpen) {
    return `${lead}Clique em Vender. ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
  }

  if (ui.lotModalOpen && !ui.saleFormOpen) {
    return `${lead}Clique em Comercial e depois em Vender. ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
  }

  return null;
}

export function knowledgeStepStillNeeded(step: string, context: AssistantSafeContext): boolean {
  const n = normalize(step);
  const ui = context.ui;
  if (ui.contractId || context.pathname.startsWith('/contracts')) {
    if (/abra contratos|localize o contrato|menu lateral/.test(n)) return false;
  }
  if (ui.saleFormOpen) {
    if (/mapa gis|aba comercial|clique em vender|abra o lote/.test(n)) return false;
    if (ui.customerSelected && /selecione o cliente|busque o cliente|cadastre o cliente/.test(n)) {
      return false;
    }
  }
  if (ui.lotModalOpen && /mapa gis|escolha o empreendimento|abra o lote/.test(n)) return false;
  if (ui.activeLotTab === 'comercial' && /aba comercial/.test(n)) return false;
  return true;
}
