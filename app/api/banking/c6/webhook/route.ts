import { NextResponse } from 'next/server';
import {
  C6_NOTIFICATIONS_REGISTER_METHOD,
  C6_NOTIFICATIONS_REGISTER_PATH,
  C6_NOTIFICATIONS_REQUIRED_FIELDS,
  C6_NOTIFICATIONS_SERVICE,
} from '@/lib/banking/c6/c6NotificationsOpenApi';
import { C6_BOLETO_OPERATIONS } from '@/lib/banking/c6/c6BoletoOpenApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * O OpenAPI de notificações não descreve o corpo que o banco enviaria.
 * Esta rota não lê pagamento, não baixa parcela e não grava financeiro.
 * A baixa implementada consulta GET /v1/bank_slips/{id}.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'Corpo da notificação C6 ausente no OpenAPI versionado. Nenhuma baixa foi feita.',
      inboundSchema: 'absent',
      register: {
        method: C6_NOTIFICATIONS_REGISTER_METHOD,
        path: C6_NOTIFICATIONS_REGISTER_PATH,
        service: C6_NOTIFICATIONS_SERVICE,
        fields: C6_NOTIFICATIONS_REQUIRED_FIELDS,
      },
      settlementQuery: {
        method: C6_BOLETO_OPERATIONS.get.method,
        path: C6_BOLETO_OPERATIONS.get.path,
      },
    },
    { status: 422 },
  );
}
