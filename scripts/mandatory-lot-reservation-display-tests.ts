/**
 * Testes — exibição da reserva no modal GIS.
 * npx tsx scripts/mandatory-lot-reservation-display-tests.ts
 */
import assert from 'node:assert/strict';
import {
  buildLotReservationDisplay,
  buildReservationConvertedAuditDescription,
  buildReservationCreatedAuditDescription,
  buildReservationExpiredAuditDescription,
  formatReservationDateTimeBr,
  isLotReservedStatus,
  isReservationExpired,
  LOT_RESERVATION_UNKNOWN_ACTOR,
} from '../lib/lotReservationDisplay';

assert.equal(isLotReservedStatus('Reservado'), true);
assert.equal(isLotReservedStatus('reserved'), true);
assert.equal(isLotReservedStatus('Disponível'), false);
assert.equal(isLotReservedStatus('Vendido'), false);

const now = new Date('2026-08-10T12:00:00.000Z');
assert.equal(
  isReservationExpired('2026-08-09T12:00:00.000Z', now),
  true,
);
assert.equal(
  isReservationExpired('2026-08-11T12:00:00.000Z', now),
  false,
);

const active = buildLotReservationDisplay(
  {
    status: 'Reservado',
    customerName: 'Rômulo Jardel Gomes Ferreira',
    customerId: 'c1',
    reservationDate: '2026-08-06T13:35:00.000Z',
    reservationExpiresAt: '2026-08-13T13:35:00.000Z',
    reservedByName: 'João da Silva',
  },
  { now: new Date('2026-08-07T12:00:00.000Z') },
);
assert.ok(active);
assert.equal(active!.customerName, 'Rômulo Jardel Gomes Ferreira');
assert.equal(active!.reservedByLabel, 'João da Silva');
assert.equal(active!.situation, 'active');
assert.equal(active!.situationLabel, 'Reserva ativa');
assert.ok(active!.reservedAtLabel?.includes('06/08/2026'));
assert.ok(active!.expiresAtLabel?.includes('13/08/2026'));

const expired = buildLotReservationDisplay(
  {
    status: 'Reservado',
    customerName: 'Cliente X',
    customerId: 'c2',
    reservationDate: '2026-08-01T10:00:00.000Z',
    reservationExpiresAt: '2026-08-03T10:00:00.000Z',
    reservedByUserId: 'u1',
  },
  {
    now: new Date('2026-08-10T12:00:00.000Z'),
    resolvedReservedByName: 'Maria Corretora',
  },
);
assert.ok(expired);
assert.equal(expired!.situation, 'expired');
assert.equal(expired!.situationLabel, 'Reserva vencida');
assert.equal(expired!.reservedByLabel, 'Maria Corretora');

const legacy = buildLotReservationDisplay({
  status: 'Reservado',
  customerName: 'Cliente Legado',
  customerId: 'c3',
  reservationDate: '2026-01-01T10:00:00.000Z',
  reservationExpiresAt: '2026-01-03T10:00:00.000Z',
});
assert.ok(legacy);
assert.equal(legacy!.reservedByLabel, LOT_RESERVATION_UNKNOWN_ACTOR);

const legacyBrokerOnly = buildLotReservationDisplay({
  status: 'Reservado',
  customerName: 'Cliente Legado',
  customerId: 'c3',
  brokerName: 'Corretor Legado',
});
assert.ok(legacyBrokerOnly);
assert.equal(legacyBrokerOnly!.reservedByLabel, LOT_RESERVATION_UNKNOWN_ACTOR);

assert.equal(buildLotReservationDisplay({ status: 'Disponível' }), null);
assert.equal(
  buildLotReservationDisplay({ status: 'Vendido', customerName: 'X' }),
  null,
);

assert.equal(
  buildReservationCreatedAuditDescription({
    actorName: 'João da Silva',
    customerName: 'Rômulo Jardel Gomes Ferreira',
  }),
  'Reserva criada por João da Silva para o cliente Rômulo Jardel Gomes Ferreira.',
);
assert.equal(
  buildReservationConvertedAuditDescription(),
  'Reserva convertida em venda.',
);
assert.match(
  buildReservationExpiredAuditDescription('2026-08-13T13:35:00.000Z') || '',
  /Reserva vencida em /,
);

assert.ok(formatReservationDateTimeBr('2026-08-06T13:35:00.000Z'));

console.log('mandatory-lot-reservation-display-tests: OK');
