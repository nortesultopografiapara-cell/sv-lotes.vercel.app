/**
 * Memorial descritivo — tipos (MEM-001).
 */

import type { ConfrontantSource } from '@/lib/confrontantTypes';
import type { TechnicalResponsibleProfile } from '@/lib/technicalResponsible';

export type MemorialCompanyInfo = {
  name: string;
  fantasyName: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  slogan: string;
  website: string;
  instagram: string;
  logoUrl: string;
  signatureUrl: string;
};

export type MemorialIdentification = {
  owner: string;
  property: string;
  project: string;
  quadra: string;
  lote: string;
  municipality: string;
  matricula: string;
  areaM2: string;
  perimeterM: string;
};

export type MemorialSideSummary = {
  frente: string;
  fundo: string;
  ladoDireito: string;
  ladoEsquerdo: string;
  chanfre: string;
};

export type MemorialSegmentRow = {
  segmentIndex: number;
  fromVertex: string;
  toVertex: string;
  northStart: number;
  eastStart: number;
  northEnd: number;
  eastEnd: number;
  coordNStart: string;
  coordEStart: string;
  coordNEnd: string;
  coordEEnd: string;
  azimuth: string;
  distanceM: number;
  distanceLabel: string;
  confrontant: string;
  confrontantSource: ConfrontantSource;
  isCurve: boolean;
  curveDescription: string | null;
};

export type MemorialPayload = {
  block: Record<string, unknown>;
  project: Record<string, unknown>;
  company: MemorialCompanyInfo;
  technical: TechnicalResponsibleProfile;
  identification: MemorialIdentification;
  sides: MemorialSideSummary;
  segments: MemorialSegmentRow[];
  descriptionText: string;
  observations: string[];
  hasPendingConfrontations: boolean;
  pendingWarning: string | null;
  generatedAt: string;
  projectName: string;
  utmZone: string;
};

export type MemorialGenerateOptions = {
  allowPending?: boolean;
};

/** Entrada legada (memorialDraft / prancha). */
export type MemorialDraftInput = {
  block: Record<string, unknown>;
  projectId?: string;
  projectBlocks?: Record<string, unknown>[];
  streetGuides?: Record<string, unknown>[];
  technicalResponsible?: Record<string, unknown> | null;
};
