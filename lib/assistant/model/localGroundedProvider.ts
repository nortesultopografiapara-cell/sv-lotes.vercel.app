import { ASSISTANT_CONTINUE_OFFER, ASSISTANT_MASTER_DISCLAIMER, ASSISTANT_MAX_OUTPUT_CHARS } from '../constants';
import { composeFromCapability } from '../capabilities/compose';
import { composeFromValidatedUi } from '../composeFromUi';
import type { AssistantModelDifference, AssistantProcedure, AssistantSafeContext } from '../types';
import type { AssistantModelGenerateInput, AssistantModelGenerateResult, AssistantModelProvider } from './types';

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isLotAlreadyOpen(input: AssistantModelGenerateInput): boolean {
  if (input.context.ui?.lotModalOpen || input.context.ui?.saleFormOpen) return true;
  const question = input.messages.at(-1)?.content || '';
  return /lote aberto|ja estou no mapa|ja cliquei no lote|lote selecionado|ja estou com o lote/.test(
    normalize(question),
  );
}

function isClientAlreadySelected(input: AssistantModelGenerateInput): boolean {
  if (input.context.ui?.customerSelected) return true;
  return /ja selecionei o cliente|cliente ja|ja escolhi o cliente/.test(
    normalize(input.messages.at(-1)?.content || ''),
  );
}

function isCommercialTabOpen(context: AssistantSafeContext): boolean {
  return context.ui?.activeLotTab === 'comercial';
}

function isWhoNeedsToSign(question: string): boolean {
  return /quem (precisa |deve |tem que )?assin|o que falta neste contrato/.test(normalize(question));
}

function isLiveConsultQuestion(question: string): boolean {
  const n = normalize(question);
  return /tem parcela|parcela vencida|vencid[ao] hoje|inadimplen/.test(n);
}

function skipUntil(steps: string[], matcher: (step: string) => boolean): string[] {
  const index = steps.findIndex((step) => matcher(normalize(step)));
  if (index < 0) return steps;
  return steps.slice(index);
}

function isDocumentGoal(input: AssistantModelGenerateInput): boolean {
  const id = input.activeGoal?.id || input.activeGoal?.procedureId || '';
  return /memorial|prancha|confront|frente|general_plan|lot.sheet/.test(id);
}

function pickProcedure(input: AssistantModelGenerateInput): AssistantProcedure | null {
  if (input.activeGoal?.procedureId) {
    const targeted = input.knowledge.find((item) => item.id === input.activeGoal?.procedureId);
    if (targeted) return targeted;
  }
  const question = normalize(input.messages[input.messages.length - 1]?.content || '');
  const ui = input.context.ui;
  const model = input.context.contractModel;
  if (isLiveConsultQuestion(question)) {
    const finance = input.knowledge.find((item) => item.module === 'finance');
    if (finance) return finance;
  }
  if (input.context.moduleId === 'contracts' || ui?.contractId) {
    const contracts = input.knowledge.filter((item) => item.module === 'contracts');
    if (model) {
      const matched = contracts.find((item) => item.contractModels?.includes(model));
      if (matched) return matched;
    }
    if (/mundo novo/.test(question)) {
      return contracts.find((item) => item.id.includes('mundo-novo')) || contracts[0] || null;
    }
    if (/lf|estrela/.test(question)) {
      return contracts.find((item) => item.id.includes('lf-imoveis')) || contracts[0] || null;
    }
    if (contracts[0]) return contracts[0];
  }
  const gisUi = Boolean(ui?.lotModalOpen || ui?.saleFormOpen || input.context.moduleId === 'gis');
  if (gisUi && !/assinatur|o que falta neste contrato/.test(question)) {
    const gis = input.knowledge.find((item) => item.module === 'gis');
    if (gis) return gis;
  }
  if (model) {
    const matched = input.knowledge.find((item) => item.contractModels?.includes(model));
    if (matched) return matched;
  }
  if (/mundo novo/.test(question)) {
    return input.knowledge.find((item) => item.id.includes('mundo-novo')) || input.knowledge[0] || null;
  }
  if (/lf|estrela/.test(question)) {
    return input.knowledge.find((item) => item.id.includes('lf-imoveis')) || input.knowledge[0] || null;
  }
  if (/recanto/.test(question)) {
    return input.knowledge.find((item) => item.id.includes('venda-parcelada')) || input.knowledge[0] || null;
  }
  if (/contrato|assinatur/.test(question)) {
    return input.knowledge.find((item) => item.module === 'contracts') || input.knowledge[0] || null;
  }
  return input.knowledge[0] || null;
}

function relevantModelNotes(procedure: AssistantProcedure, contractModel: string | null, question: string): string[] {
  const diffs: AssistantModelDifference[] = procedure.modelDifferences || [];
  const n = normalize(question);
  if (contractModel) {
    return diffs.filter((item) => item.models.includes(contractModel)).map((item) => item.note);
  }
  if (/recanto/.test(n)) {
    return diffs.filter((item) => item.models.includes('RECANTO_PRIMAVERA')).map((item) => item.note);
  }
  if (/mundo novo/.test(n)) {
    return diffs.filter((item) => item.models.includes('MUNDO_NOVO')).map((item) => item.note);
  }
  if (/lf|estrela/.test(n)) {
    return diffs.filter((item) => item.models.includes('ESTRELA_DO_SUL')).map((item) => item.note);
  }
  return [];
}

function describeUiLead(context: AssistantSafeContext): string {
  const ui = context.ui;
  if (!ui) {
    if (context.pathname.startsWith('/contracts')) return 'Você já está em Contratos. ';
    if (context.pathname.startsWith('/map')) return 'Você já está no Mapa GIS. ';
    return '';
  }
  const parts: string[] = [];
  if (ui.lotNumber || ui.blockNumber) {
    const lot = ui.lotNumber ? `Lote ${ui.lotNumber}` : 'este lote';
    const block = ui.blockNumber ? ` da Quadra ${ui.blockNumber}` : '';
    const project = context.projectName ? ` do ${context.projectName}` : '';
    const status = ui.lotStatus ? ` e ele está ${ui.lotStatus.toLowerCase()}` : '';
    parts.push(`Você está no ${lot}${block}${project}${status}.`);
  } else if (context.pathname.startsWith('/contracts')) {
    parts.push('Você já está em Contratos.');
  } else if (context.pathname.startsWith('/map')) {
    parts.push('Você já está no Mapa GIS.');
  }
  if (ui.contractNumber) {
    parts.push(`Contrato ${ui.contractNumber} selecionado.`);
  }
  return parts.length ? `${parts.join(' ')} ` : '';
}

function nextSteps(input: AssistantModelGenerateInput, procedure: AssistantProcedure): string[] {
  let steps = procedure.steps.slice();
  const ui = input.context.ui;
  if (isClientAlreadySelected(input) && !isDocumentGoal(input)) {
    steps = skipUntil(
      steps,
      (step) =>
        step.includes('parcelado') ||
        step.includes('forma de pagamento') ||
        step.includes('sinal') ||
        step.includes('avista') ||
        step.includes('a vista'),
    );
    return steps;
  }
  if (ui?.saleFormOpen && !isDocumentGoal(input)) {
    steps = skipUntil(
      steps,
      (step) => step.includes('cliente') || step.includes('comprador') || step.includes('selecion'),
    );
    return steps;
  }
  if (isDocumentGoal(input)) {
    steps = skipUntil(
      steps,
      (step) =>
        step.includes('gerar memorial') ||
        step.includes('gerar prancha') ||
        step.includes('gerar pdf') ||
        step.includes('confront') ||
        step.includes('prancha geral'),
    );
    return steps;
  }
  if (isCommercialTabOpen(input.context)) {
    steps = skipUntil(steps, (step) => step.includes('vender') && !step.includes('comercial'));
    if (steps === procedure.steps) {
      steps = skipUntil(steps, (step) => step.includes('vender'));
    }
    return steps.filter((step) => !normalize(step).includes('abra a aba comercial'));
  }
  if (isLotAlreadyOpen(input) && procedure.module === 'gis') {
    steps = skipUntil(steps, (step) => step.includes('comercial') || step.includes('vender'));
  }
  return steps;
}

export const localGroundedProvider: AssistantModelProvider = {
  id: 'local-grounded',
  available: () => true,
  async generate(input: AssistantModelGenerateInput): Promise<AssistantModelGenerateResult> {
    if (input.readonlyFacts) {
      return { text: '', providerId: 'local-grounded' };
    }
    const uiAnswer = composeFromValidatedUi({
      question: input.messages[input.messages.length - 1]?.content || '',
      context: input.context,
      activeGoal: input.activeGoal,
    });
    if (uiAnswer) {
      const master =
        input.context.viewer === 'master' && !input.context.impersonatingTenant
          ? `${ASSISTANT_MASTER_DISCLAIMER} `
          : '';
      return {
        text: `${master}${uiAnswer}`.replace(/\s+/g, ' ').trim().slice(0, ASSISTANT_MAX_OUTPUT_CHARS),
        providerId: 'local-grounded',
      };
    }
    const procedure = pickProcedure(input);
    const capability = input.capabilities?.[0];
    if (!procedure && capability) {
      const already = capability.routes.some(
        (route) => input.context.pathname === route || input.context.pathname.startsWith(`${route}/`),
      );
      const masterCap =
        input.context.viewer === 'master' && !input.context.impersonatingTenant
          ? `${ASSISTANT_MASTER_DISCLAIMER} `
          : '';
      return {
        text: `${masterCap}${composeFromCapability(capability, already)}`
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, ASSISTANT_MAX_OUTPUT_CHARS),
        providerId: 'local-grounded',
      };
    }
    if (!procedure) {
      return { text: '', providerId: 'local-grounded' };
    }

    const question = input.messages[input.messages.length - 1]?.content || '';
    const lead = describeUiLead(input.context);
    const steps = nextSteps(input, procedure);
    const modelNotes = relevantModelNotes(procedure, input.context.contractModel, question);
    const master =
      input.context.viewer === 'master' && !input.context.impersonatingTenant
        ? `${ASSISTANT_MASTER_DISCLAIMER} `
        : '';

    let text: string;
    const ui = input.context.ui;
    const hasStructuredUi = Boolean(ui?.lotModalOpen || ui?.saleFormOpen || ui?.contractId);
    const followUp = input.history.some((item) => item.role === 'user');

    if (isWhoNeedsToSign(question) && ui?.nextAction) {
      const parties =
        ui.partyTotal != null ? ` Partes assinadas: ${ui.partySigned ?? 0}/${ui.partyTotal}.` : '';
      text = `${lead}Status: ${ui.contractStatus || 'contrato selecionado'}. Próxima ação: ${ui.nextAction}.${parties}`;
    } else if (isLiveConsultQuestion(question) && procedure.module === 'finance') {
      text = `${lead}O Assistente SV não consulta o banco em tempo real. Abra Financeiro → Parcelas e filtre por vencimento ou situação (Inadimplência) para ver o que está vencido hoje.`;
    } else if (hasStructuredUi && ui?.saleFormOpen && ui.customerSelected) {
      text = `${lead}Em Forma de Pagamento, escolha À vista ou Parcelado e confira os valores antes de Confirmar Venda.`;
    } else if (hasStructuredUi && ui?.saleFormOpen && !ui.customerSelected) {
      text = `${lead}Selecione o cliente na operação. Depois escolha a forma de pagamento.`;
    } else if (isDocumentGoal(input) || /memorial|prancha|confront|frente/.test(procedure.id)) {
      text = `${lead}${steps.slice(0, 4).join(' ')}`;
    } else if (
      hasStructuredUi &&
      ui?.lotModalOpen &&
      !isCommercialTabOpen(input.context) &&
      procedure.module === 'gis'
    ) {
      text = `${lead}Clique em Comercial e depois em Vender.`;
    } else if (hasStructuredUi && isCommercialTabOpen(input.context) && procedure.module === 'gis' && !ui?.saleFormOpen) {
      text = `${lead}Clique em Vender.`;
    } else if (followUp && (isLotAlreadyOpen(input) || isClientAlreadySelected(input))) {
      text = `${lead}Ótimo. ${steps.slice(0, 4).join(' ')}`;
    } else if (hasStructuredUi) {
      text = `${lead}${steps.slice(0, 4).join(' ')}`;
    } else {
      const preview = steps.slice(0, 6);
      const last = procedure.steps[procedure.steps.length - 1];
      if (last && !preview.includes(last)) preview.push(last);
      text = `${lead}${preview.join(' ')}`;
    }

    if (
      modelNotes[0] &&
      (procedure.module === 'contracts' ||
        /recanto|mundo novo|lf|estrela|modelo|assinatur|sinal/.test(normalize(question)))
    ) {
      text += ` ${modelNotes[0]}`;
    }
    text += hasStructuredUi
      ? ` ${ASSISTANT_CONTINUE_OFFER}`
      : ' Se quiser, posso te acompanhar passo a passo a partir da tela em que você está.';

    return {
      text: `${master}${text}`.replace(/\s+/g, ' ').trim().slice(0, ASSISTANT_MAX_OUTPUT_CHARS),
      providerId: 'local-grounded',
    };
  },
};
