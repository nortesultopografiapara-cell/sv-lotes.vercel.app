import { ASSISTANT_CONTINUE_OFFER } from './constants';
import type { AssistantActiveGoal } from './activeGoal';
import type { AssistantSafeContext } from './types';
import { looksLikeChargeFollowUp, looksLikeGlobalChargeQuestion, looksLikeSaleChargeQuestion } from './saleChargesIntent';
import {
  isAssistantContractsPath,
  isAssistantSaleWorkspaceOpen,
  scopeAssistantUiToRoute,
  type AssistantUiSafeState,
} from './uiSnapshot';

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isAssistantNowQuestion(question: string): boolean {
  const n = normalize(question);
  return (
    /o que .{0,24}(faco|falt)/.test(n) ||
    /e agora|proximo passo|proxima acao|vender este lote|finalizar (esse|este|o) contrato/.test(n) ||
    /quem (precisa |deve |tem que )?assin/.test(n) ||
    /(este|esse|neste) contrato/.test(n)
  );
}

function uiLead(context: AssistantSafeContext): string {
  const ui = context.ui;
  const parts: string[] = [];
  if (isAssistantContractsPath(context.pathname) && (ui.contractId || ui.contractNumber)) {
    parts.push('Você já está em Contratos.');
  } else if (ui.saleEditOpen && ui.saleEditTab === 'cobrancas') {
    parts.push('Você já está na aba Cobranças desta venda.');
  } else if (ui.saleEditOpen) {
    parts.push('Você já está em Editar venda.');
  } else if (ui.lotNumber || ui.blockNumber) {
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

function saleChargesNext(ui: AssistantUiSafeState, question: string): string | null {
  if (!ui.saleEditOpen) return null;
  const n = normalize(question);
  const alreadyGenerated = /ja gerei|ja cliquei em gerar/.test(n);

  if (ui.saleEditTab !== 'cobrancas') {
    return 'Abra a aba Cobranças para gerar ou sincronizar os boletos desta venda.';
  }

  if (ui.saleChargesReady && ui.saleChargesHasAccount === false) {
    return 'A conta recebedora não está configurada nesta tela; configure a conta do empreendimento antes de gerar. O Assistente não emite cobrança.';
  }

  const missing = ui.saleChargesMissing;
  if (alreadyGenerated) {
    if (missing != null && missing > 0) {
      return `Ainda há ${missing} cobrança${missing === 1 ? '' : 's'} faltante${missing === 1 ? '' : 's'}. Clique em Gerar cobranças faltantes para as que restam. Depois use Atualizar situação das cobranças para sincronizar os status, quando necessário.`;
    }
    return 'Use Atualizar situação das cobranças para sincronizar os status. Não é preciso gerar de novo se não houver faltantes.';
  }

  if (missing != null && missing > 0) {
    const eligible = ui.saleChargesEligible != null ? ` (${ui.saleChargesEligible} elegíveis)` : '';
    return `Há ${missing} cobrança${missing === 1 ? '' : 's'} faltante${missing === 1 ? '' : 's'}${eligible}. Clique em Gerar cobranças faltantes. Depois use Atualizar situação das cobranças para sincronizar os status, quando necessário.`;
  }

  if (ui.saleChargesReady && missing === 0) {
    return 'Não há cobranças faltantes para gerar. Se precisar sincronizar os status, clique em Atualizar situação das cobranças.';
  }

  return 'Se houver cobranças faltantes ou elegíveis, clique em Gerar cobranças faltantes. Use Atualizar situação das cobranças para sincronizar os status, quando necessário.';
}

function saleNext(ui: AssistantUiSafeState): string | null {
  if (ui.saleEditOpen) return null;
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

function goalNext(goal: AssistantActiveGoal | null | undefined, ui: ReturnType<typeof scopeAssistantUiToRoute>): string | null {
  if (!goal) return null;
  if (goal.id === 'gis.lot.memorial') {
    if (ui.lotModalOpen) {
      return 'Na ficha do lote, aba Resumo, clique em Gerar memorial. Depois, em Memorial Descritivo (PDF), clique em Gerar PDF / Baixar.';
    }
    return 'Clique no lote no mapa. No modal Memorial Descritivo (PDF), clique em Gerar PDF / Baixar.';
  }
  if (goal.id === 'gis.lot.sheet') {
    if (ui.lotModalOpen) {
      return 'Na ficha do lote, aba Resumo, clique em Gerar prancha. Depois, em Prancha do Lote (PDF), clique em Gerar PDF / Baixar.';
    }
    return 'Clique no lote no mapa. No modal Prancha do Lote (PDF), clique em Gerar PDF / Baixar.';
  }
  if (goal.id === 'gis.project.general_plan') {
    return 'Na barra vertical, clique em Prancha Geral. No modal Prancha Geral do Empreendimento, clique em Gerar PDF.';
  }
  if (goal.id === 'gis.lot.confrontations') {
    if (ui.lotModalOpen) {
      return 'Abra a aba Confrontações, clique em Editar, informe o confrontante e Salvar.';
    }
    return 'Na barra, use Confrontação Automática ou clique no lote e abra a aba Confrontações.';
  }
  if (goal.id === 'broker.photo.update') {
    return 'Na lista de Corretores, clique na foto do corretor. No modal Foto do corretor, clique em Adicionar foto ou Alterar foto, escolha a imagem e clique em Salvar foto.';
  }
  if (goal.id === 'finance.accounts.upsert') {
    return 'Abra Configurações → Integração Financeira → Contas Financeiras. Clique em Nova conta Asaas ou Nova conta Inter, preencha Nome da conta * e clique em Criar conta (ou Salvar alterações se for edição).';
  }
  if (goal.id === 'sale.termination.distrato') {
    if (ui.lotModalOpen) {
      return 'Na aba Comercial, clique em Disponibilizar. No modal Operações da venda, grupo Encerrar venda, escolha o card Distrato, informe a justificativa e Confirmar liberação do lote.';
    }
    return 'Abra o lote vendido. Clique em Disponibilizar → Encerrar venda → Distrato → Confirmar liberação do lote.';
  }
  if (goal.id === 'sale.termination.desistencia') {
    if (ui.lotModalOpen) {
      return 'Na aba Comercial, clique em Disponibilizar. No modal Operações da venda, escolha Desistência do cliente e Confirmar liberação do lote.';
    }
    return 'Abra o lote vendido. Clique em Disponibilizar → Encerrar venda → Desistência do cliente → Confirmar liberação do lote.';
  }
  if (goal.id === 'sale.termination.inadimplencia') {
    return 'Abra o lote vendido, Disponibilizar → Encerrar venda → Inadimplência. Se a política bloquear, siga o aviso da tela.';
  }
  if (goal.id === 'sale.release') {
    if (ui.lotModalOpen) {
      return 'Clique em Disponibilizar. Em Encerrar venda escolha o motivo (Desistência, Distrato ou Inadimplência). Não mude o status à mão e não use Troca de lote para devolver o lote.';
    }
    return 'No lote vendido, aba Comercial, clique em Disponibilizar e escolha o card de Encerrar venda. O Assistente não altera o lote.';
  }
  if (goal.id === 'sale.lot.swap') {
    return 'Abra o lote da venda, Disponibilizar → Alterar venda → Troca de lote. Isso não usa Confirmar liberação do lote.';
  }
  if (goal.id === 'sale.title.transfer') {
    return 'Abra o lote da venda, Disponibilizar → Alterar venda → Transferência de titularidade. Não libera o lote.';
  }
  if (goal.id === 'sale.edit') {
    return 'No lote vendido, aba Comercial, clique em Editar Venda. Apenas administradores editam venda concluída.';
  }
  if (goal.id === 'sale.charges') {
    if (ui.saleEditOpen && ui.saleEditTab === 'cobrancas') return null;
    if (ui.saleEditOpen) return 'Abra a aba Cobranças nesta mesma tela de Editar venda.';
    return 'No lote vendido, aba Comercial, clique em Editar Venda e abra a aba Cobranças.';
  }
  if (goal.id === 'contract.cancel') {
    return 'Em Contratos, o botão Cancelar só marca o contrato como cancelado e a venda como CANCELLED. Isso não devolve o lote. Para liberar o lote, use Disponibilizar no mapa, em Operações da venda.';
  }
  if (goal.id === 'gis.sold.view_contract') {
    return 'No lote vendido, aba Comercial, clique em Ver Contrato. Abre Contratos em nova aba, com o contrato do lote em destaque quando houver vínculo.';
  }
  if (goal.id === 'gis.sold.view_finance') {
    return 'No lote vendido, aba Comercial, clique em Ver Financeiro. Abre o Financeiro em nova aba, sem filtrar sozinho a venda.';
  }
  if (goal.id === 'broker.my_sales') {
    return 'No menu do corretor, abra Minhas Vendas. Use as abas Todas, Vendas ou Reservas. A tela não mostra valores financeiros.';
  }
  if (goal.id === 'settings.data_migration') {
    return 'Abra Migração de Dados, aba Assistente, clique em Iniciar Migração e siga Tipo → Modelo → Upload → Pré-validação → Pré-visualização → Confirmação.';
  }
  if (goal.id === 'finance.asaas.installment') {
    return 'No Financeiro, use Sincronizar Asaas no topo. Na parcela, no painel Asaas, escolha PIX ou Boleto e clique em Gerar Cobrança.';
  }
  if (goal.id === 'client_portal.access') {
    return 'Não há tela administrativa do Portal do Cliente no app operador. Oriente o comprador a abrir /portal-cliente, informar o documento e Continuar; a confirmação é por código no WhatsApp.';
  }
  return null;
}

/**
 * Resposta a partir do estado real validado.
 * Tem prioridade sobre passos genéricos da KB (ex.: "Abra Contratos").
 */
export function composeFromValidatedUi(input: {
  question: string;
  context: AssistantSafeContext;
  activeGoal?: AssistantActiveGoal | null;
}): string | null {
  const ui = scopeAssistantUiToRoute(input.context.pathname, input.context.ui);
  const context: AssistantSafeContext = { ...input.context, ui };
  const lead = uiLead(context);
  const n = normalize(input.question);
  const chargesIntent =
    !looksLikeGlobalChargeQuestion(input.question, context.pathname) &&
    (looksLikeSaleChargeQuestion(input.question) ||
      looksLikeChargeFollowUp(input.question) ||
      input.activeGoal?.id === 'sale.charges');

  if (chargesIntent && ui.saleEditOpen) {
    const next = saleChargesNext(ui, input.question);
    if (next) return `${lead}${next} ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
  }

  if (!isAssistantNowQuestion(input.question) && input.activeGoal?.id !== 'sale.charges') return null;

  const aboutContract = isAssistantContractsPath(context.pathname) || /contrato/.test(n);

  if (ui.contractId && aboutContract) {
    const next = contractNext(context);
    if (next) return `${lead}${next} ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
  }

  if (ui.saleFormOpen && !ui.saleEditOpen && !isAssistantContractsPath(context.pathname)) {
    const next = saleNext(ui);
    if (next) return `${lead}${next} ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
  }

  const fromGoal = goalNext(input.activeGoal, ui);
  if (fromGoal && !ui.saleFormOpen && !ui.saleEditOpen) {
    return `${lead}${fromGoal} ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
  }

  if (ui.contractId) {
    const next = contractNext(context);
    if (next) return `${lead}${next} ${ASSISTANT_CONTINUE_OFFER}`.replace(/\s+/g, ' ').trim();
  }

  if (
    isAssistantContractsPath(context.pathname) &&
    !ui.contractId &&
    /neste contrato|este contrato|esse contrato/.test(n)
  ) {
    return `${lead}Você já está em Contratos. Selecione o contrato nesta tela para eu dizer o que falta. ${ASSISTANT_CONTINUE_OFFER}`
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (ui.saleEditOpen) return null;

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
  const ui = scopeAssistantUiToRoute(context.pathname, context.ui);
  if (ui.contractId || isAssistantContractsPath(context.pathname)) {
    if (/abra contratos|localize o contrato|menu lateral/.test(n)) return false;
    if (/cliente|forma de pagamento|confirmar venda|cadastre o cliente/.test(n) && ui.contractId) {
      return false;
    }
  }
  if (ui.saleFormOpen || ui.saleEditOpen) {
    if (/mapa gis|aba comercial|clique em vender|abra o lote/.test(n)) return false;
    if (ui.customerSelected && /selecione o cliente|busque o cliente|cadastre o cliente/.test(n)) {
      return false;
    }
  }
  if (ui.saleEditOpen && ui.saleEditTab === 'cobrancas') {
    if (/abra cobrancas|menu lateral|central operacional/.test(n)) return false;
  }
  if (ui.lotModalOpen && /mapa gis|escolha o empreendimento|abra o lote/.test(n)) return false;
  if (ui.activeLotTab === 'comercial' && /aba comercial/.test(n)) return false;
  return true;
}
