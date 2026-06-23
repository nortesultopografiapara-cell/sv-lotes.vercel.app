/**
 * Histórico persistente de eventos de assinatura eletrônica.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type SignatureEventSource = 'SAAS' | 'SALE';

export type SignatureEventType =
  | 'DOCUMENT_GENERATED'
  | 'LINK_CREATED'
  | 'PAGE_ACCESSED'
  | 'DOCUMENT_VIEWED'
  | 'CLIENT_SIGNED'
  | 'PROVIDER_SIGNED'
  | 'CERTIFICATE_ISSUED'
  | 'QR_VALIDATED';

export type LogSignatureEventInput = {
  signatureToken: string;
  signatureSource: SignatureEventSource;
  signatureRecordId?: string | null;
  eventType: SignatureEventType;
  personName?: string | null;
  personEmail?: string | null;
  personPhone?: string | null;
  ipAddress?: string | null;
  ipPort?: string | null;
  userAgent?: string | null;
  eventDescription: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};

export async function logSignatureEvent(
  supabaseAdmin: SupabaseClient,
  input: LogSignatureEventInput,
): Promise<void> {
  const token = String(input.signatureToken || '').trim();
  if (!token) return;

  const { error } = await supabaseAdmin.from('signature_events').insert({
    signature_token: token,
    signature_source: input.signatureSource,
    signature_record_id: input.signatureRecordId || null,
    event_type: input.eventType,
    person_name: input.personName?.trim() || null,
    person_email: input.personEmail?.trim() || null,
    person_phone: input.personPhone?.trim() || null,
    ip_address: input.ipAddress?.trim() || null,
    ip_port: input.ipPort?.trim() || null,
    user_agent: input.userAgent?.trim() || null,
    event_description: input.eventDescription,
    occurred_at: input.occurredAt || new Date().toISOString(),
    metadata: input.metadata || {},
  });

  if (error) {
    console.warn('[SIGNATURE_EVENT]', error.message);
  }
}

export type SignatureEventRow = {
  id: string;
  signature_token: string;
  signature_source: SignatureEventSource;
  signature_record_id: string | null;
  event_type: SignatureEventType;
  person_name: string | null;
  person_email: string | null;
  person_phone: string | null;
  ip_address: string | null;
  ip_port: string | null;
  user_agent: string | null;
  event_description: string;
  occurred_at: string;
  metadata: Record<string, unknown>;
};

export async function listSignatureEventsByToken(
  supabaseAdmin: SupabaseClient,
  token: string,
): Promise<SignatureEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from('signature_events')
    .select('*')
    .eq('signature_token', token)
    .order('occurred_at', { ascending: true });

  if (error) {
    console.warn('[SIGNATURE_EVENT] list', error.message);
    return [];
  }
  return (data || []) as SignatureEventRow[];
}

export const SIGNATURE_EVENT_LABELS: Record<SignatureEventType, string> = {
  DOCUMENT_GENERATED: 'Documento gerado',
  LINK_CREATED: 'Link de assinatura criado',
  PAGE_ACCESSED: 'Página pública acessada',
  DOCUMENT_VIEWED: 'Documento visualizado',
  CLIENT_SIGNED: 'Assinatura do comprador/cliente',
  PROVIDER_SIGNED: 'Assinatura do vendedor/SV',
  CERTIFICATE_ISSUED: 'Certificado emitido',
  QR_VALIDATED: 'Documento validado via QR Code',
};

export function signatureEventLabel(eventType: string): string {
  return SIGNATURE_EVENT_LABELS[eventType as SignatureEventType] || eventType;
}
