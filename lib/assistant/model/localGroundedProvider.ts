import { ASSISTANT_MASTER_DISCLAIMER, ASSISTANT_MAX_OUTPUT_CHARS } from '../constants';
import type { AssistantModelDifference, AssistantProcedure } from '../types';
import type { AssistantModelGenerateInput, AssistantModelGenerateResult, AssistantModelProvider } from './types';

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isLotAlreadyOpen(question: string, historyText: string): boolean {
  const blob = `${historyText}\n${question}`;
  return /lote aberto|ja estou no mapa|ja cliquei no lote|lote selecionado|ja estou com o lote/.test(
    normalize(blob),
  );
}

function isClientAlreadySelected(question: string): boolean {
  return /ja selecionei o cliente|cliente ja|ja escolhi o cliente/.test(normalize(question));
}

function isWhoNeedsToSign(question: string): boolean {
  return /quem (precisa |deve |tem que )?assin/.test(normalize(question));
}

function screenLead(pathname: string): string {
  if (pathname.startsWith('/contracts')) return 'Você já está em Contratos. ';
  if (pathname.startsWith('/map')) return 'Você já está no Mapa GIS. ';
  if (pathname.startsWith('/charges')) return 'Você já está em Cobranças. ';
  if (pathname.startsWith('/finance')) return 'Você já está no Financeiro. ';
  return '';
}

function skipUntil(steps: string[], matcher: (step: string) => boolean): string[] {
  const index = steps.findIndex((step) => matcher(normalize(step)));
  if (index <= 0) return steps;
  return steps.slice(index);
}

function pickProcedure(input: AssistantModelGenerateInput): AssistantProcedure | null {
  const model = input.context.contractModel;
  if (model) {
    const matched = input.knowledge.find((item) => item.contractModels?.includes(model));
    if (matched) return matched;
  }
  const question = normalize(input.messages[input.messages.length - 1]?.content || '');
  if (/mundo novo/.test(question)) {
    return input.knowledge.find((item) => item.id.includes('mundo-novo')) || input.knowledge[0] || null;
  }
  if (/lf|estrela/.test(question)) {
    return input.knowledge.find((item) => item.id.includes('lf-imoveis')) || input.knowledge[0] || null;
  }
  if (/recanto/.test(question)) {
    return input.knowledge.find((item) => item.id.includes('venda-parcelada')) || input.knowledge[0] || null;
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

function titleLead(title: string): string {
  const lower = title.trim();
  if (/^venda /i.test(lower)) {
    return `Para fazer uma ${lower.charAt(0).toLowerCase()}${lower.slice(1).replace(/ de lote$/i, '')}`;
  }
  return `Para ${lower.charAt(0).toLowerCase()}${lower.slice(1)}`;
}

/**
 * Provider local grounded na KB — sem rede.
 * Gera texto conversacional curto a partir dos procedimentos recuperados.
 */
export const localGroundedProvider: AssistantModelProvider = {
  id: 'local-grounded',
  available: () => true,
  async generate(input: AssistantModelGenerateInput): Promise<AssistantModelGenerateResult> {
    const procedure = pickProcedure(input);
    if (!procedure) {
      return { text: '', providerId: 'local-grounded' };
    }

    const question = input.messages[input.messages.length - 1]?.content || '';
    const historyText = input.history.map((item) => item.text).join('\n');
    const lead = screenLead(input.context.pathname);
    let steps = procedure.steps.slice();

    if (isLotAlreadyOpen(question, historyText) && procedure.module === 'gis') {
      steps = skipUntil(steps, (step) => step.includes('comercial') || step.includes('vender'));
    }
    if (isClientAlreadySelected(question)) {
      steps = skipUntil(
        steps,
        (step) =>
          step.includes('parcelado') ||
          step.includes('forma de pagamento') ||
          step.includes('sinal') ||
          step.includes('enviar para assinatura'),
      );
    }

    const followUp = input.history.some((item) => item.role === 'user');
    const modelNotes = relevantModelNotes(procedure, input.context.contractModel, question);
    const master =
      input.context.viewer === 'master' && !input.context.impersonatingTenant
        ? `${ASSISTANT_MASTER_DISCLAIMER} `
        : '';

    let text: string;
    if (isWhoNeedsToSign(question)) {
      text = `${lead}${procedure.objective} ${modelNotes.join(' ')} ${procedure.expectedResult}`;
    } else if (followUp && (isLotAlreadyOpen(question, historyText) || isClientAlreadySelected(question))) {
      text = `${lead}Ótimo. ${steps.slice(0, 4).join(' ')}`;
      if (modelNotes[0] && /recanto|sinal|parcela/.test(normalize(question))) {
        text += ` ${modelNotes[0]}`;
      }
    } else if (followUp) {
      text = `${lead}${steps.slice(0, 4).join(' ')}`;
    } else {
      const preview = steps.slice(0, 6);
      const last = steps[steps.length - 1];
      if (last && !preview.includes(last)) preview.push(last);
      text = `${lead}${titleLead(procedure.title)}. ${preview.join(' ')} ${procedure.expectedResult}`;
      if (modelNotes[0]) text += ` ${modelNotes[0]}`;
      text += ' Se quiser, posso te acompanhar passo a passo a partir da tela em que você está.';
    }

    const finalText = `${master}${text}`.replace(/\s+/g, ' ').trim().slice(0, ASSISTANT_MAX_OUTPUT_CHARS);
    return {
      text: finalText,
      providerId: 'local-grounded',
    };
  },
};
