import type { MasterTopographyOperation } from './operationTypes';
import { buildWhatsAppUrl } from '@/lib/whatsapp/clickToChat';

function formatDateTimeBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

export function buildOperationPdfFilename(operation: MasterTopographyOperation): string {
  const clientSlug =
    String(operation.client_name || 'cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .toLowerCase() || 'cliente';
  return `${operation.code}-${clientSlug}.pdf`;
}

export function buildOperationShareMessage(operation: MasterTopographyOperation): string {
  const nome = operation.responsible_name || 'colaborador';
  const data = operation.scheduled_start
    ? formatDateTimeBr(operation.scheduled_start)
    : 'a definir';
  const local = operation.location_name || operation.address || 'a definir';
  return `Olá, ${nome}. Segue a Ordem de Serviço ${operation.code}, referente a ${operation.title}. Serviço previsto para ${data}, no local ${local}.`;
}

export function buildWhatsAppShareUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  return buildWhatsAppUrl(phone, message);
}
