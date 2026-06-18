/**
 * Anexa dados do corretor ao objeto sale para geração de contrato.
 */

export type BrokerSnapshot = {
  name: string;
  cpf: string;
  document: string;
  creci: string;
};

function clean(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text === 'undefined' || text === 'null') return '';
  return text;
}

export function brokerRowToSnapshot(
  row: Record<string, unknown> | null | undefined,
): BrokerSnapshot | null {
  if (!row || typeof row !== 'object') return null;
  const name = clean(row.name);
  if (!name) return null;
  const cpf = clean(row.cpf || row.document);
  const creci = clean(row.creci);
  return {
    name,
    cpf,
    document: cpf,
    creci,
  };
}

export function attachBrokerSnapshotToSale(
  sale: Record<string, unknown>,
  broker: BrokerSnapshot | null | undefined,
): Record<string, unknown> {
  if (!broker?.name) return sale;
  return {
    ...sale,
    brokers: broker,
    broker: broker,
    broker_name: broker.name,
    broker_cpf: broker.cpf,
    broker_creci: broker.creci,
  };
}
