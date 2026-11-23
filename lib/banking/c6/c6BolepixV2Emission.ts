/**
 * Pedido Bolepix v2. Não chama o banco e não volta para a API v1.
 * A EVP entra só quando o servidor já a decifrou. Sem chave, o Pix não é omitido.
 */

import { createHash } from 'node:crypto';
import {
  buildC6BolepixV2CreateBody,
  type C6BolepixV2CreateInput,
} from '@/lib/banking/c6/c6BolepixV2Validation';

export const C6_BOLEPIX_V2_PIX_REQUIRED_MESSAGE =
  'Cadastre a chave Pix aleatória (EVP) antes de emitir o Bolepix v2. Sem a chave, a emissão não segue e não volta para a API v1.';

export class C6BolepixPixKeyRequiredError extends Error {
  constructor() {
    super(C6_BOLEPIX_V2_PIX_REQUIRED_MESSAGE);
    this.name = 'C6BolepixPixKeyRequiredError';
  }
}

/** Referência estável de 26 caracteres. Não é o id interno do banco. */
export function c6BolepixV2ReferenceForInstallment(installmentId: string): string {
  const digest = createHash('sha256').update(`c6-bolepix-v2:${installmentId}`).digest('hex').toUpperCase();
  return digest.slice(0, 26);
}

export function buildC6BolepixV2EmissionBody(
  input: Omit<C6BolepixV2CreateInput, 'pixKey'> & { pixKey?: string | null },
  now = new Date(),
): Record<string, unknown> {
  const pixKey = String(input.pixKey || '').trim();
  if (!pixKey) throw new C6BolepixPixKeyRequiredError();
  const body = buildC6BolepixV2CreateBody({ ...input, pixKey }, now);
  const payment = body.payment_method as { pix?: { type?: string; key?: string }; bank_slip?: { billing_scheme?: string } };
  if (payment.pix?.type !== 'EVP' || payment.pix.key !== pixKey) {
    throw new C6BolepixPixKeyRequiredError();
  }
  if (payment.bank_slip?.billing_scheme !== '15' && payment.bank_slip?.billing_scheme !== '21') {
    throw new Error('Carteira Bolepix inválida.');
  }
  return body;
}
