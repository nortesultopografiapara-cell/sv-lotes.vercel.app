import type { AssistantChatTurn } from '../types';
import { isAssistantContinuationQuestion } from '../activeGoal';
import { isAssistantContractsPath } from '../uiSnapshot';
import type { AssistantSafeContext } from '../types';
import type { AssistantReadonlyToolArgs, AssistantReadonlyToolId } from './types';

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isHowToQuestion(n: string): boolean {
  return (
    /como (vejo|veja|consulto|uso|faco|envio|cadastro|configuro|gero|assino|edito|cancelo|libero)/.test(n) ||
    /onde (vejo|consulto|fica|esta)/.test(n) ||
    /^quero (saber )?como /.test(n)
  );
}

function isWriteCommand(n: string): boolean {
  return /^(cubra|cobre|de baixa|de a baixa|cancele|envia(r|e)? o contrato|reserve o lote|faca o distrato|execute )/.test(
    n,
  );
}

export type AssistantReadonlyIntent = {
  toolId: AssistantReadonlyToolId;
  args: AssistantReadonlyToolArgs;
};

function extractProjectName(n: string, context: AssistantSafeContext): string | null {
  const match = n.match(
    /(?:disponiveis|reservados|vendidos|lotes).{0,24}(?:no|na|em)\s+(.+?)(?:\?|$)/,
  );
  const named = match?.[1]?.replace(/\s+/g, ' ').trim();
  if (named && named.length >= 3) return named;
  return context.ui.projectName || context.projectName || null;
}

function lastUserQuestion(history: AssistantChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].role === 'user') return history[i].text;
  }
  return '';
}

function intentFromText(
  n: string,
  context: AssistantSafeContext,
): AssistantReadonlyIntent | null {
  if (isHowToQuestion(n) || isWriteCommand(n)) return null;

  if (
    /parcela/.test(n) &&
    /(vencid|atraso|em atraso|inadimplen)/.test(n) &&
    /(tem |quant|qual o valor|valor total|clientes)/.test(n)
  ) {
    return { toolId: 'finance.overdue_summary', args: {} };
  }
  if (/^tem parcela/.test(n) || /parcela vencida hoje/.test(n)) {
    return { toolId: 'finance.overdue_summary', args: {} };
  }
  if (/quantas (estao |estão )?vencidas|valor total em atraso/.test(n)) {
    return { toolId: 'finance.overdue_summary', args: {} };
  }
  if (/de quantos clientes|quantos clientes/.test(n)) {
    return { toolId: 'finance.overdue_summary', args: {} };
  }

  const wantsPendingNames = /quem (ainda )?falta assinar|quem nao assinou|quais partes faltam/.test(n);
  const wantsSignedAll = /ja (foi )?assinad|assinaram todos|todos (ja )?assinaram|falta assinar/.test(n);
  const mentionsLatest = /ultimo contrato|ultimo que (eu )?mandei|enviado para assinatura/.test(n);
  const selected = Boolean(context.ui.contractId);
  const onContracts = isAssistantContractsPath(context.pathname);

  if (wantsPendingNames || wantsSignedAll) {
    if (selected && (onContracts || !mentionsLatest)) {
      return {
        toolId: 'contract.signature_status',
        args: {
          contractId: context.ui.contractId,
          contractNumber: context.ui.contractNumber,
          includePendingNames: wantsPendingNames,
        },
      };
    }
    return {
      toolId: 'contract.latest_signature_status',
      args: { includePendingNames: wantsPendingNames },
    };
  }

  if (/ultima venda|ultima venda que|qual foi minha ultima venda/.test(n)) {
    return { toolId: 'sale.latest', args: {} };
  }

  if (/quantos lotes|lotes (estao |estão )?disponiveis|estoque (do |da |de )/.test(n)) {
    return {
      toolId: 'project.inventory',
      args: {
        projectId: context.ui.projectId,
        projectName: extractProjectName(n, context),
      },
    };
  }

  return null;
}

export function resolveAssistantReadonlyIntent(input: {
  question: string;
  history?: AssistantChatTurn[];
  context: AssistantSafeContext;
}): AssistantReadonlyIntent | null {
  const n = normalize(input.question);
  const history = input.history || [];
  const direct = intentFromText(n, input.context);
  if (direct) return direct;

  const prior = normalize(lastUserQuestion(history));
  const continuation =
    isAssistantContinuationQuestion(input.question) ||
    /de quantos clientes|quantos clientes|e o valor|qual o total|quem (ainda )?falta/.test(n);
  if (!continuation || !prior) return null;
  return intentFromText(prior, input.context);
}
