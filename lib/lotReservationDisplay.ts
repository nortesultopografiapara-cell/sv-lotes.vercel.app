/**
 * Exibição e resolução da reserva no modal GIS do lote.
 * Isolado por empresa — nunca usa o usuário logado atual como responsável.
 */

export type LotReservationSituation = 'active' | 'expired';

export type LotReservationDisplay = {
  customerName: string;
  reservedByLabel: string;
  reservedAtLabel: string | null;
  expiresAtLabel: string | null;
  situation: LotReservationSituation;
  situationLabel: string;
  /** Reserva ainda vinculada ao lote (status Reservado). */
  isLinkedReservation: boolean;
};

export type LotReservationSource = {
  status?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  reservationDate?: string | null;
  reservationExpiresAt?: string | null;
  reservedByUserId?: string | null;
  reservedByName?: string | null;
  /** Fallback legado: broker_id do bloco (pode ser corretor selecionado, não o ator). */
  brokerId?: string | null;
  brokerName?: string | null;
};

const UNKNOWN_LEGACY = 'Não identificado no registro antigo';

export function isLotReservedStatus(status: string | null | undefined): boolean {
  const n = String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return n === 'reservado' || n === 'reserved';
}

export function isReservationExpired(
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (!Number.isFinite(t)) return false;
  return t < now.getTime();
}

export function formatReservationDateTimeBr(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const date = d.toLocaleDateString('pt-BR');
  const time = d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} às ${time}`;
}

/**
 * Monta o modelo visual da seção Reserva.
 * Retorna null se não houver reserva vinculada ao lote.
 */
export function buildLotReservationDisplay(
  source: LotReservationSource,
  options?: {
    resolvedReservedByName?: string | null;
    now?: Date;
  },
): LotReservationDisplay | null {
  if (!isLotReservedStatus(source.status)) return null;

  const customerName = String(source.customerName || '').trim();
  if (!customerName && !source.customerId) return null;

  const expired = isReservationExpired(
    source.reservationExpiresAt,
    options?.now,
  );
  const situation: LotReservationSituation = expired ? 'expired' : 'active';

  const fromSnapshot = String(source.reservedByName || '').trim();
  const fromResolved = String(options?.resolvedReservedByName || '').trim();
  // Não usar broker_id/nome do formulário como responsável — pode ser outro corretor.
  const reservedByLabel = fromSnapshot || fromResolved || UNKNOWN_LEGACY;

  return {
    customerName: customerName || '—',
    reservedByLabel,
    reservedAtLabel: formatReservationDateTimeBr(source.reservationDate),
    expiresAtLabel: formatReservationDateTimeBr(source.reservationExpiresAt),
    situation,
    situationLabel: expired ? 'Reserva vencida' : 'Reserva ativa',
    isLinkedReservation: true,
  };
}

export function buildReservationCreatedAuditDescription(input: {
  actorName: string;
  customerName: string;
}): string {
  const actor = String(input.actorName || '').trim() || 'usuário';
  const customer = String(input.customerName || '').trim() || 'cliente';
  return `Reserva criada por ${actor} para o cliente ${customer}.`;
}

export function buildReservationExpiredAuditDescription(
  expiresAt: string | null | undefined,
): string {
  const label = formatReservationDateTimeBr(expiresAt);
  return label
    ? `Reserva vencida em ${label}.`
    : 'Reserva vencida.';
}

export function buildReservationConvertedAuditDescription(): string {
  return 'Reserva convertida em venda.';
}

export const LOT_RESERVATION_UNKNOWN_ACTOR = UNKNOWN_LEGACY;
