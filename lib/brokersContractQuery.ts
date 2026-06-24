/**
 * Colunas seguras para leitura de corretores em contratos.
 * A tabela brokers NÃO possui coluna `document` em produção — usar cpf.
 */
export const BROKERS_CONTRACT_SELECT = 'id, name, cpf, creci, role';

export const BROKERS_COMMISSION_CONTRACT_SELECT =
  `broker_id, brokers(${BROKERS_CONTRACT_SELECT})`;
