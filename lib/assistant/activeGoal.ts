import type { AssistantChatTurn, AssistantModuleId, AssistantSafeContext } from './types';

export type AssistantActiveGoal = {
  id: string;
  procedureId: string;
  label: string;
  module: AssistantModuleId;
};

type GoalDef = AssistantActiveGoal & {
  patterns: RegExp[];
};

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const GOAL_DEFS: GoalDef[] = [
  {
    id: 'broker.photo.update',
    procedureId: 'brokers-foto',
    label: 'foto do corretor',
    module: 'brokers',
    patterns: [/foto.{0,24}corretor|corretor.{0,24}foto|avatar.{0,16}corretor|foto.{0,12}equipe/],
  },
  {
    id: 'gis.project.general_plan',
    procedureId: 'gis-prancha-geral',
    label: 'Prancha Geral do empreendimento',
    module: 'gis',
    patterns: [/prancha geral|prancha do empreendimento|overview do empreendimento/],
  },
  {
    id: 'gis.lot.sheet',
    procedureId: 'gis-prancha-lote',
    label: 'prancha do lote',
    module: 'gis',
    patterns: [/prancha do lote|gerar prancha|prancha pdf|(^| )prancha( |\?|$)/],
  },
  {
    id: 'gis.lot.memorial',
    procedureId: 'gis-lot-memorial',
    label: 'memorial descritivo do lote',
    module: 'gis',
    patterns: [/memorial( descritivo)?|gerar memorial|pdf memorial/],
  },
  {
    id: 'gis.lot.confrontations',
    procedureId: 'gis-confrontacoes',
    label: 'confrontações',
    module: 'gis',
    patterns: [/confrontac|revisar confront|confrontacao automatica/],
  },
  {
    id: 'gis.lot.front',
    procedureId: 'gis-corrigir-frente',
    label: 'corrigir frente do lote',
    module: 'gis',
    patterns: [/corrigir frente|frente do lote|identificar frentes/],
  },
  {
    id: 'gis.lot.sell.installments',
    procedureId: 'gis-venda-parcelada',
    label: 'venda parcelada',
    module: 'gis',
    patterns: [/venda parcelad|vender.{0,20}parcel|parcelado/],
  },
  {
    id: 'gis.lot.reserve',
    procedureId: 'gis-reserva',
    label: 'reserva de lote',
    module: 'gis',
    patterns: [/reservar|reserva de lote|reservo um lote/],
  },
  {
    id: 'gis.lot.sell.cash',
    procedureId: 'gis-venda-avista',
    label: 'venda à vista',
    module: 'gis',
    patterns: [/venda a vista|vender.{0,12}vista|a vista/],
  },
  {
    id: 'customer.upsert',
    procedureId: 'customers-cadastro',
    label: 'cadastro de cliente',
    module: 'customers',
    patterns: [/cadastr.{0,12}cliente|novo cliente|editar cliente/],
  },
  {
    id: 'finance.accounts.upsert',
    procedureId: '',
    label: 'contas recebedoras',
    module: 'settings',
    patterns: [
      /contas? recebedor|conta financeira|cadastrar (uma )?conta (financeira|recebedor)|nova conta (asaas|inter|financeira)|conta para receber|adicionar outra conta/,
    ],
  },
  {
    id: 'finance.receipts',
    procedureId: 'finance-recibos',
    label: 'recibos e baixa no Financeiro',
    module: 'finance',
    patterns: [/recibo|baixa(r)? (a )?parcela|registrar pagamento/],
  },
  {
    id: 'finance.cashflow',
    procedureId: 'finance-fluxo-caixa',
    label: 'fluxo de caixa',
    module: 'finance',
    patterns: [/fluxo de caixa|registrar saida/],
  },
  {
    id: 'charge.emit',
    procedureId: 'charges-cobrancas',
    label: 'emitir cobrança',
    module: 'charges',
    patterns: [/emitir cobranca|gerar cobranca|boleto|pix/],
  },
  {
    id: 'charge.whatsapp.batch',
    procedureId: 'charges-whatsapp',
    label: 'WhatsApp de cobrança',
    module: 'charges',
    patterns: [/whatsapp.{0,20}(lote|cobranca|massa)|cobranca.{0,16}whatsapp/],
  },
  {
    id: 'contract.signature.send',
    procedureId: 'contracts-enviar-assinatura',
    label: 'enviar contrato para assinatura',
    module: 'contracts',
    patterns: [/enviar (para |p\/ )?assinatura|assinatura eletronica|reenviar para assinatura/],
  },
  {
    id: 'contract.regenerate',
    procedureId: 'contracts-regenerar',
    label: 'regenerar contrato',
    module: 'contracts',
    patterns: [/regenerar contrato/],
  },
  {
    id: 'settings.project',
    procedureId: 'gis-config-empreendimento',
    label: 'configuração do empreendimento',
    module: 'gis',
    patterns: [/configur.{0,16}empreendimento|editar projeto|novo projeto|modelo de contrato/],
  },
  {
    id: 'split.configure',
    procedureId: 'gis-split-recebimentos',
    label: 'Split de Recebimentos',
    module: 'split',
    patterns: [/\bsplit\b|rateio|configurar split/],
  },
];

export function isAssistantContinuationQuestion(question: string): boolean {
  const n = normalize(question).trim();
  if (!n) return false;
  if (
    /e agora|proximo passo|proxima acao|e depois|continua(r)? daqui|ja selecionei|ja cliquei|ja escolhi|ja abri o lote|selecionei o lote/.test(
      n,
    )
  ) {
    return true;
  }
  return /^(ok|certo|pronto|feito|e agora\??)$/.test(n);
}

function matchGoal(text: string): GoalDef | null {
  const n = normalize(text);
  for (const def of GOAL_DEFS) {
    if (def.patterns.some((pattern) => pattern.test(n))) return def;
  }
  return null;
}

/**
 * Objetivo conversacional (memória). Não substitui o snapshot factual da UI.
 */
export function resolveAssistantActiveGoal(input: {
  question: string;
  history?: AssistantChatTurn[];
  context?: AssistantSafeContext;
}): AssistantActiveGoal | null {
  const current = matchGoal(input.question);
  const continuation = isAssistantContinuationQuestion(input.question);
  if (current && !continuation) {
    return {
      id: current.id,
      procedureId: current.procedureId,
      label: current.label,
      module: current.module,
    };
  }

  const history = input.history || [];
  const fromHistory = (): AssistantActiveGoal | null => {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const turn = history[index];
      if (turn.role !== 'user') continue;
      const found = matchGoal(turn.text);
      if (found) {
        return {
          id: found.id,
          procedureId: found.procedureId,
          label: found.label,
          module: found.module,
        };
      }
    }
    return null;
  };

  if (continuation) return fromHistory();

  if (current) {
    return {
      id: current.id,
      procedureId: current.procedureId,
      label: current.label,
      module: current.module,
    };
  }

  const words = normalize(input.question)
    .split(/\s+/)
    .filter((item) => item.length > 2);
  if (words.length >= 2) return null;
  return fromHistory();
}

export function listAssistantGoalProcedureIds(): string[] {
  return GOAL_DEFS.map((item) => item.procedureId);
}
