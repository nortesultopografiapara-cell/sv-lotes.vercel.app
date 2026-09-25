/** Estado operacional seguro da interface — sem PII, secrets ou HTML. */

export type AssistantLotTab = 'resumo' | 'confrontacoes' | 'comercial' | 'historico';

export type AssistantPaymentModeHint = 'avista' | 'parcelado' | 'reserva' | 'outro';

/** Dicas enviadas pelo frontend. IDs são validados no servidor. */
export type AssistantUiClientHints = {
  projectId?: string | null;
  lotId?: string | null;
  contractId?: string | null;
  lotModalOpen?: boolean;
  activeLotTab?: AssistantLotTab | null;
  saleFormOpen?: boolean;
  paymentMode?: AssistantPaymentModeHint | null;
  customerSelected?: boolean;
  blockNumber?: string | null;
  lotNumber?: string | null;
  lotStatus?: string | null;
  installmentsFilled?: boolean;
  firstDueFilled?: boolean;
  brokerSelected?: boolean;
  downPaymentFilled?: boolean;
};

export type AssistantUiSafeState = {
  projectId: string | null;
  projectName: string | null;
  contractModel: string | null;
  lotId: string | null;
  blockNumber: string | null;
  lotNumber: string | null;
  lotStatus: string | null;
  lotModalOpen: boolean;
  activeLotTab: AssistantLotTab | null;
  saleFormOpen: boolean;
  paymentMode: AssistantPaymentModeHint | null;
  customerSelected: boolean;
  installmentsFilled: boolean;
  firstDueFilled: boolean;
  brokerSelected: boolean;
  downPaymentFilled: boolean;
  contractId: string | null;
  contractNumber: string | null;
  contractStatus: string | null;
  signatureStatus: string | null;
  eSignStarted: boolean;
  partyTotal: number | null;
  partySigned: number | null;
  pendingExternal: number | null;
  pendingInternalVendor: boolean;
  pendingPartyRoles: string[];
  nextAction: string | null;
  needsRegenerar: boolean;
};

export const EMPTY_ASSISTANT_UI_STATE: AssistantUiSafeState = {
  projectId: null,
  projectName: null,
  contractModel: null,
  lotId: null,
  blockNumber: null,
  lotNumber: null,
  lotStatus: null,
  lotModalOpen: false,
  activeLotTab: null,
  saleFormOpen: false,
  paymentMode: null,
  customerSelected: false,
  installmentsFilled: false,
  firstDueFilled: false,
  brokerSelected: false,
  downPaymentFilled: false,
  contractId: null,
  contractNumber: null,
  contractStatus: null,
  signatureStatus: null,
  eSignStarted: false,
  partyTotal: null,
  partySigned: null,
  pendingExternal: null,
  pendingInternalVendor: false,
  pendingPartyRoles: [],
  nextAction: null,
  needsRegenerar: false,
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeUuidHint(value: unknown): string | null {
  const text = String(value || '').trim();
  if (!UUID_RE.test(text)) return null;
  return text;
}

const LOT_TABS = new Set<AssistantLotTab>(['resumo', 'confrontacoes', 'comercial', 'historico']);

export function sanitizeLotTab(value: unknown): AssistantLotTab | null {
  const text = String(value || '').trim().toLowerCase();
  if (LOT_TABS.has(text as AssistantLotTab)) return text as AssistantLotTab;
  return null;
}

export function sanitizePaymentModeHint(value: unknown): AssistantPaymentModeHint | null {
  const text = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!text) return null;
  if (text.includes('parcel')) return 'parcelado';
  if (text.includes('vista') || text === 'avista' || text.includes('a vista')) return 'avista';
  if (text.includes('reserv')) return 'reserva';
  return 'outro';
}

export function sanitizeDisplayHint(value: unknown, max = 40): string | null {
  const text = String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.slice(0, max);
}

export function sanitizeUiClientHints(raw: unknown): AssistantUiClientHints {
  if (!raw || typeof raw !== 'object') return {};
  const input = raw as Record<string, unknown>;
  return {
    projectId: sanitizeUuidHint(input.projectId),
    lotId: sanitizeUuidHint(input.lotId),
    contractId: sanitizeUuidHint(input.contractId),
    lotModalOpen: Boolean(input.lotModalOpen),
    activeLotTab: sanitizeLotTab(input.activeLotTab),
    saleFormOpen: Boolean(input.saleFormOpen),
    paymentMode: sanitizePaymentModeHint(input.paymentMode),
    customerSelected: Boolean(input.customerSelected),
    blockNumber: sanitizeDisplayHint(input.blockNumber, 20),
    lotNumber: sanitizeDisplayHint(input.lotNumber, 20),
    lotStatus: sanitizeDisplayHint(input.lotStatus, 24),
    installmentsFilled: Boolean(input.installmentsFilled),
    firstDueFilled: Boolean(input.firstDueFilled),
    brokerSelected: Boolean(input.brokerSelected),
    downPaymentFilled: Boolean(input.downPaymentFilled),
  };
}

const GIS_OPERATIONAL_RESET: Pick<
  AssistantUiSafeState,
  | 'lotId'
  | 'blockNumber'
  | 'lotNumber'
  | 'lotStatus'
  | 'lotModalOpen'
  | 'activeLotTab'
  | 'saleFormOpen'
  | 'paymentMode'
  | 'customerSelected'
  | 'installmentsFilled'
  | 'firstDueFilled'
  | 'brokerSelected'
  | 'downPaymentFilled'
> = {
  lotId: null,
  blockNumber: null,
  lotNumber: null,
  lotStatus: null,
  lotModalOpen: false,
  activeLotTab: null,
  saleFormOpen: false,
  paymentMode: null,
  customerSelected: false,
  installmentsFilled: false,
  firstDueFilled: false,
  brokerSelected: false,
  downPaymentFilled: false,
};

const CONTRACT_OPERATIONAL_RESET: Pick<
  AssistantUiSafeState,
  | 'contractId'
  | 'contractNumber'
  | 'contractStatus'
  | 'signatureStatus'
  | 'eSignStarted'
  | 'partyTotal'
  | 'partySigned'
  | 'pendingExternal'
  | 'pendingInternalVendor'
  | 'pendingPartyRoles'
  | 'nextAction'
  | 'needsRegenerar'
> = {
  contractId: null,
  contractNumber: null,
  contractStatus: null,
  signatureStatus: null,
  eSignStarted: false,
  partyTotal: null,
  partySigned: null,
  pendingExternal: null,
  pendingInternalVendor: false,
  pendingPartyRoles: [],
  nextAction: null,
  needsRegenerar: false,
};

export function isAssistantContractsPath(pathname: string): boolean {
  const path = String(pathname || '');
  return path === '/contracts' || path.startsWith('/contracts/');
}

export function isAssistantGisPath(pathname: string): boolean {
  const path = String(pathname || '');
  return path === '/map' || path.startsWith('/map/') || path === '/my-sales' || path.startsWith('/my-sales/');
}

/**
 * Estado operacional pertence à rota/entidade atual.
 * Histórico de conversa não entra aqui.
 */
export function scopeAssistantUiToRoute(
  pathname: string,
  ui: AssistantUiSafeState,
  opts?: { selectedProjectId?: string | null },
): AssistantUiSafeState {
  let next: AssistantUiSafeState = { ...ui };
  if (isAssistantContractsPath(pathname)) {
    next = { ...next, ...GIS_OPERATIONAL_RESET, projectId: null };
  } else if (isAssistantGisPath(pathname)) {
    next = { ...next, ...CONTRACT_OPERATIONAL_RESET };
    if (!next.lotModalOpen && !next.saleFormOpen) {
      next = { ...next, ...GIS_OPERATIONAL_RESET };
    }
  } else {
    next = { ...next, ...GIS_OPERATIONAL_RESET, ...CONTRACT_OPERATIONAL_RESET, projectId: null };
  }

  const selected = opts?.selectedProjectId || null;
  if (selected && next.projectId && next.projectId !== selected) {
    next = { ...next, ...GIS_OPERATIONAL_RESET, projectId: selected };
  }
  return next;
}

export function scopeAssistantHintsToRoute(
  pathname: string,
  hints: AssistantUiClientHints,
): AssistantUiClientHints {
  const next: AssistantUiClientHints = { ...hints };
  if (isAssistantContractsPath(pathname)) {
    return {
      ...next,
      projectId: null,
      lotId: null,
      lotModalOpen: false,
      activeLotTab: null,
      saleFormOpen: false,
      paymentMode: null,
      customerSelected: false,
      blockNumber: null,
      lotNumber: null,
      lotStatus: null,
      installmentsFilled: false,
      firstDueFilled: false,
      brokerSelected: false,
      downPaymentFilled: false,
    };
  }
  if (isAssistantGisPath(pathname)) {
    const liveLot = Boolean(next.lotModalOpen || next.saleFormOpen);
    return {
      ...next,
      contractId: null,
      ...(liveLot
        ? {}
        : {
            lotId: null,
            lotModalOpen: false,
            activeLotTab: null,
            saleFormOpen: false,
            paymentMode: null,
            customerSelected: false,
            blockNumber: null,
            lotNumber: null,
            lotStatus: null,
            installmentsFilled: false,
            firstDueFilled: false,
            brokerSelected: false,
            downPaymentFilled: false,
          }),
    };
  }
  return {
    ...next,
    lotId: null,
    contractId: null,
    lotModalOpen: false,
    activeLotTab: null,
    saleFormOpen: false,
    paymentMode: null,
    customerSelected: false,
    blockNumber: null,
    lotNumber: null,
    lotStatus: null,
    installmentsFilled: false,
    firstDueFilled: false,
    brokerSelected: false,
    downPaymentFilled: false,
  };
}

export function resolveContractNextAction(input: {
  contractStatus?: string | null;
  signatureStatus?: string | null;
  needsRegenerar?: boolean;
  eSignStarted?: boolean;
  pendingExternal?: number | null;
  pendingInternalVendor?: boolean;
  contractModel?: string | null;
}): string | null {
  if (input.needsRegenerar) return 'Regenerar contrato';
  const contractStatus = String(input.contractStatus || '').toLowerCase();
  if (['cancelado', 'cancelled', 'canceled', 'superseded'].includes(contractStatus)) {
    return 'Somente consulta';
  }
  const sig = String(input.signatureStatus || '').toUpperCase();
  if (sig === 'SIGNED' || contractStatus === 'assinado' || contractStatus === 'signed') {
    return 'Contrato já assinado';
  }
  if (!input.eSignStarted) return 'Enviar para assinatura';
  if ((input.pendingExternal ?? 0) > 0) return 'Acompanhar assinaturas';
  if (input.pendingInternalVendor) {
    return String(input.contractModel || '').toUpperCase() === 'ESTRELA_DO_SUL'
      ? 'Assinar promitente vendedor'
      : 'Assinar como vendedor';
  }
  if (sig === 'CLIENT_SIGNED') return 'Assinar como vendedor';
  if (sig === 'PENDING' || sig === 'VIEWED' || sig === 'PARTIALLY_SIGNED') {
    return 'Acompanhar assinaturas';
  }
  return 'Enviar para assinatura';
}
