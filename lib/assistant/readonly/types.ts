export const ASSISTANT_READONLY_TOOL_IDS = [
  'finance.overdue_summary',
  'contract.latest_signature_status',
  'contract.signature_status',
  'sale.latest',
  'project.inventory',
] as const;

export type AssistantReadonlyToolId = (typeof ASSISTANT_READONLY_TOOL_IDS)[number];

export type AssistantReadonlyToolArgs = {
  contractId?: string | null;
  contractNumber?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  includePendingNames?: boolean;
};

export type AssistantReadonlyOverdueFacts = {
  toolId: 'finance.overdue_summary';
  referenceDate: string;
  overdueCount: number;
  overdueAmount: number;
  customerCount: number;
};

export type AssistantReadonlySignatureFacts = {
  toolId: 'contract.latest_signature_status' | 'contract.signature_status';
  found: boolean;
  contractNumber: string | null;
  overallState: 'assinado' | 'parcial' | 'aguardando' | 'nao_enviado' | 'cancelado' | null;
  partyTotal: number;
  partySigned: number;
  partyPending: number;
  pendingRoles: string[];
  pendingParties: Array<{ name: string; role: string }>;
  awaitingInternalVendor: boolean;
  sentAt: string | null;
};

export type AssistantReadonlySaleFacts = {
  toolId: 'sale.latest';
  found: boolean;
  saleDate: string | null;
  status: string | null;
  projectName: string | null;
  lotLabel: string | null;
  amount: number | null;
};

export type AssistantReadonlyInventoryFacts = {
  toolId: 'project.inventory';
  found: boolean;
  projectName: string | null;
  available: number;
  reserved: number;
  sold: number;
  paid: number;
  total: number;
};

export type AssistantReadonlyFacts =
  | AssistantReadonlyOverdueFacts
  | AssistantReadonlySignatureFacts
  | AssistantReadonlySaleFacts
  | AssistantReadonlyInventoryFacts;

export type AssistantReadonlyFailureReason =
  | 'forbidden'
  | 'no_tenant'
  | 'not_found'
  | 'error'
  | 'unknown_tool';

export type AssistantReadonlyExecution =
  | { ok: true; facts: AssistantReadonlyFacts; rowCount: number }
  | {
      ok: false;
      reason: AssistantReadonlyFailureReason;
      forbiddenReason?: 'broker' | 'owner-write' | 'profile';
    };

export type AssistantReadonlyRuntime = {
  tenantId: string | null;
  userId: string;
  role: string;
  client?: AssistantReadonlyDb;
  now?: Date;
  execute?: (
    toolId: AssistantReadonlyToolId,
    args: AssistantReadonlyToolArgs,
  ) => Promise<AssistantReadonlyExecution>;
};

/** Cliente de consulta. Tools só chamam select/eq/or/in/not/lt/ilike/order/limit/range/maybeSingle. */
export type AssistantReadonlyDb = {
  from: (table: string) => {
    select: (columns: string) => any;
  };
};
