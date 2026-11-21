import { NextResponse } from 'next/server';
import {
  C6_H1_ACTION_DISARMED_MESSAGE,
  isC6H1HomologActionArmed,
} from '@/lib/banking/c6/c6H1Authorization';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Endpoint interno da fase C6-H1. Fora do menu de cobrança.
 * Enquanto a ação estiver desarmada, responde 403 e não autentica, não grava e não chama o banco.
 */
export async function POST() {
  const actionEnabled = isC6H1HomologActionArmed();
  return NextResponse.json(
    {
      phase: 'C6-H1',
      executed: false,
      actionEnabled,
      bankCallAllowed: false,
      message: C6_H1_ACTION_DISARMED_MESSAGE,
    },
    { status: 403 },
  );
}
