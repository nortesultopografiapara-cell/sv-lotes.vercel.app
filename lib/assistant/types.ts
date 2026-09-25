import type { AssistantUiSafeState } from './uiSnapshot';

export type AssistantAccess = 'read' | 'write';

export type AssistantModuleId =
  | 'gis'
  | 'customers'
  | 'brokers'
  | 'contracts'
  | 'finance'
  | 'charges'
  | 'split'
  | 'settings'
  | 'dashboard'
  | 'master'
  | 'unknown';

export type AssistantModelDifference = {
  models: string[];
  note: string;
};

export type AssistantProcedure = {
  id: string;
  title: string;
  module: AssistantModuleId;
  routes: string[];
  profiles: string[];
  access: AssistantAccess;
  tags: string[];
  objective: string;
  prerequisites: string[];
  navigationPath: string[];
  steps: string[];
  expectedResult: string;
  commonErrors: string[];
  limitations: string[];
  modelDifferences: AssistantModelDifference[];
  sourceOfTruth: string[];
  uiLabels: string[];
  contractModels?: string[];
};

export type AssistantViewer = 'tenant' | 'master';

/** Contexto seguro enviado ao assistente. Sem senha, JWT, CPF, banco ou tokens. */
export type AssistantSafeContext = {
  pathname: string;
  moduleId: AssistantModuleId;
  role: string;
  roleLabel: string;
  tenantName: string | null;
  projectName: string | null;
  contractModel: string | null;
  flags: {
    clientPortal?: boolean;
    bankingUi?: boolean;
  };
  viewer: AssistantViewer;
  impersonatingTenant: boolean;
  ui: AssistantUiSafeState;
};

export type AssistantShortcut = {
  id: string;
  label: string;
  question: string;
  procedureId?: string;
  routes?: string[];
  modules?: AssistantModuleId[];
  access: AssistantAccess;
  allowedModulesWhenRestricted?: AssistantModuleId[];
};

export type AssistantChatTurn = {
  role: 'assistant' | 'user';
  text: string;
};

export type AssistantAskInput = {
  question: string;
  context: AssistantSafeContext;
  procedureId?: string;
  history?: AssistantChatTurn[];
};

export type AssistantAskKind = 'answer' | 'unknown' | 'forbidden';

export type AssistantAnswerSource = 'model' | 'local' | 'local-fallback';

export type AssistantAskResult = {
  kind: AssistantAskKind;
  text: string;
  procedureIds: string[];
  retrievedTitles: string[];
  source?: AssistantAnswerSource;
  notice?: string | null;
};

export type AssistantMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  kind?: AssistantAskKind;
  notice?: string | null;
};
