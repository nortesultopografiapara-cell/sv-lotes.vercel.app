import { filterShortcutsForRole } from './policy';
import { getAssistantProcedureById } from './knowledgeBase';
import type { AssistantSafeContext, AssistantShortcut } from './types';

export const ASSISTANT_GLOBAL_SHORTCUTS: AssistantShortcut[] = [
  {
    id: 'sale',
    label: 'Fazer uma venda',
    question: 'Como faço uma venda parcelada?',
    procedureId: 'gis-venda-parcelada',
    access: 'write',
    modules: ['gis'],
  },
  {
    id: 'reserve',
    label: 'Reservar um lote',
    question: 'Como reservo um lote?',
    procedureId: 'gis-reserva',
    access: 'write',
    modules: ['gis'],
  },
  {
    id: 'contract',
    label: 'Gerar contrato',
    question: 'Como gero o contrato da venda?',
    procedureId: 'contracts-gerar',
    access: 'write',
    modules: ['contracts'],
  },
  {
    id: 'esign',
    label: 'Assinatura eletrônica',
    question: 'Como mando o contrato para assinatura?',
    procedureId: 'contracts-enviar-assinatura',
    access: 'write',
    modules: ['contracts'],
  },
  {
    id: 'charges',
    label: 'Cobranças',
    question: 'Como emito uma cobrança?',
    procedureId: 'charges-cobrancas',
    access: 'write',
    modules: ['charges'],
  },
  {
    id: 'finance',
    label: 'Financeiro',
    question: 'Como uso o Financeiro?',
    procedureId: 'finance-visao-geral',
    access: 'read',
    modules: ['finance'],
  },
];

export const ASSISTANT_CONTEXTUAL_SHORTCUTS: AssistantShortcut[] = [
  {
    id: 'map-sell',
    label: 'Vender lote',
    question: 'Como vendo um lote pelo Mapa GIS?',
    procedureId: 'gis-venda-parcelada',
    routes: ['/map'],
    access: 'write',
    modules: ['gis'],
  },
  {
    id: 'map-reserve',
    label: 'Reservar lote',
    question: 'Como reservo um lote no mapa?',
    procedureId: 'gis-reserva',
    routes: ['/map'],
    access: 'write',
    modules: ['gis'],
  },
  {
    id: 'map-confront',
    label: 'Confrontações',
    question: 'Como rodo Confrontação Automática no mapa?',
    procedureId: 'gis-confrontacoes',
    routes: ['/map'],
    access: 'write',
    modules: ['gis'],
  },
  {
    id: 'map-memorial',
    label: 'Memorial/Prancha',
    question: 'Como gero o memorial de um lote?',
    procedureId: 'gis-lot-memorial',
    routes: ['/map'],
    access: 'write',
    modules: ['gis'],
  },
  {
    id: 'contracts-send',
    label: 'Enviar para assinatura',
    question: 'Como envio o contrato para assinatura?',
    procedureId: 'contracts-enviar-assinatura',
    routes: ['/contracts'],
    access: 'write',
    modules: ['contracts'],
  },
  {
    id: 'contracts-track',
    label: 'Acompanhar assinaturas',
    question: 'Como acompanho as assinaturas do contrato?',
    procedureId: 'contracts-enviar-assinatura',
    routes: ['/contracts'],
    access: 'read',
    modules: ['contracts'],
  },
  {
    id: 'contracts-pdf',
    label: 'Baixar PDF',
    question: 'Como baixo o PDF do contrato?',
    procedureId: 'contracts-gerar',
    routes: ['/contracts'],
    access: 'read',
    modules: ['contracts'],
  },
  {
    id: 'contracts-regen',
    label: 'Regenerar contrato',
    question: 'Como regenero o contrato?',
    procedureId: 'contracts-regenerar',
    routes: ['/contracts'],
    access: 'write',
    modules: ['contracts'],
  },
  {
    id: 'charges-emit',
    label: 'Emitir cobrança',
    question: 'Como emito cobrança em Cobranças?',
    procedureId: 'charges-cobrancas',
    routes: ['/charges'],
    access: 'write',
    modules: ['charges'],
  },
  {
    id: 'charges-whatsapp',
    label: 'Enviar WhatsApp',
    question: 'Como envio a cobrança por WhatsApp?',
    procedureId: 'charges-whatsapp',
    routes: ['/charges'],
    access: 'write',
    modules: ['charges'],
  },
  {
    id: 'charges-sync',
    label: 'Sincronizar cobrança',
    question: 'Como sincronizo o status da cobrança?',
    procedureId: 'charges-cobrancas',
    routes: ['/charges'],
    access: 'write',
    modules: ['charges'],
  },
];

export function listVisibleAssistantShortcuts(context: AssistantSafeContext): {
  global: AssistantShortcut[];
  contextual: AssistantShortcut[];
} {
  const global = filterShortcutsForRole(
    ASSISTANT_GLOBAL_SHORTCUTS,
    context,
    getAssistantProcedureById,
  );
  const contextual = filterShortcutsForRole(
    ASSISTANT_CONTEXTUAL_SHORTCUTS.filter((item) =>
      (item.routes || []).some(
        (route) => context.pathname === route || context.pathname.startsWith(`${route}/`),
      ),
    ),
    context,
    getAssistantProcedureById,
  );
  return { global, contextual };
}
