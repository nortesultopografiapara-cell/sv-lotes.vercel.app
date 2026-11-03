import type { AssistantAccess, AssistantModuleId } from '../types';

export type AssistantCapabilityOrigin = 'explicit' | 'derived';
export type AssistantCapabilityConfidence = 'high' | 'medium';

export type AssistantCapabilityControl = {
  label: string;
  kind?: 'button' | 'tab' | 'field' | 'modal' | 'toolbar' | 'list';
};

export type AssistantCapability = {
  id: string;
  title: string;
  module: AssistantModuleId;
  routes: string[];
  profiles: string[];
  access: AssistantAccess;
  aliases: string[];
  summary: string;
  origin: AssistantCapabilityOrigin;
  confidence: AssistantCapabilityConfidence;
  preconditions?: string[];
  requiredContext?: string[];
  controls?: AssistantCapabilityControl[];
  sequence?: string[];
  fields?: string[];
  validations?: string[];
  conclusion?: string;
  result?: string;
  states?: string[];
  related?: string[];
  restrictions?: string[];
  knowledgeIds?: string[];
  sourceOfTruth?: string[];
};

export type AssistantCapabilityRetrieval = {
  kind: 'answer' | 'unknown' | 'forbidden';
  capabilities: AssistantCapability[];
  considered?: string[];
  forbiddenReason?: 'broker' | 'owner-write' | 'profile';
  pass: 1 | 2;
};
