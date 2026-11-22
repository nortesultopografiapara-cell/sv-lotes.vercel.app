/**
 * Contrato B_07 a partir do roteiro C6 Developers v3.0 + host BaaS já homologado.
 * O OpenAPI de boleto 1.7.2 (docs/c6/boleto-bancario.json) NÃO descreve /webhooks/.
 * A página oficial é a API de notificações (portal /apis/notifications), não versionada neste repo.
 * Não inventar campos além de url e service.
 */

export const C6_NOTIFICATIONS_SERVICE = 'BANK_SLIP' as const;
export const C6_NOTIFICATIONS_REGISTER_PATH = '/v1/webhooks/' as const;
export const C6_NOTIFICATIONS_REGISTER_METHOD = 'POST' as const;
export const C6_NOTIFICATIONS_ROTEIRO_STATUS = 200 as const;
export const C6_NOTIFICATIONS_REQUIRED_FIELDS = ['url', 'service'] as const;

/** OpenAPI de notificações não está em docs/c6/. Consulta GET não é executada no pré-voo. */
export const C6_NOTIFICATIONS_OPENAPI_IN_REPO = false;

export type C6WebhookRegisterBody = {
  url: string;
  service: typeof C6_NOTIFICATIONS_SERVICE;
};
