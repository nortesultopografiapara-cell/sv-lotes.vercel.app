/**
 * Monta o POST /v2/bank_slips/ conforme bankslip-v2-api.yaml 1.2.0.
 * Não inventa Pix, Nosso Número nem linha digitável.
 */

import type { BankEnvironment } from '@/lib/banking/types';
import {
  C6_BOLEPIX_V2_BILLING_SCHEME,
  C6_BOLEPIX_V2_PIX_KEY_TYPE,
  C6_BOLEPIX_V2_REFERENCE_PATTERN,
} from '@/lib/banking/c6/c6BolepixV2OpenApi';

export class C6BolepixV2ValidationError extends Error {
  readonly fields: string[];

  constructor(message: string, fields: string[] = []) {
    super(message);
    this.name = 'C6BolepixV2ValidationError';
    this.fields = fields;
  }
}

export type C6BolepixV2PayerInput = {
  name: string;
  taxId: string;
  email?: string | null;
  address: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
};

export type C6BolepixV2CreateInput = {
  environment: BankEnvironment;
  externalReferenceId?: string | null;
  amount: number;
  dueDate: string;
  description: string;
  payer: C6BolepixV2PayerInput;
  pixKey?: string | null;
  ourNumber?: string | null;
};

const EVP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function inspectC6BolepixPixKey(value: string): string | null {
  const key = String(value || '').trim();
  if (!EVP.test(key)) {
    return 'A chave Pix do Bolepix precisa ser aleatória (EVP), no formato informado pelo C6.';
  }
  return null;
}

export function c6BolepixV2BillingScheme(environment: BankEnvironment): '15' | '21' {
  return environment === 'PRODUCTION'
    ? C6_BOLEPIX_V2_BILLING_SCHEME.PRODUCTION
    : C6_BOLEPIX_V2_BILLING_SCHEME.SANDBOX;
}

export function assertC6BolepixV2Reference(value: string): string {
  const reference = String(value || '').trim().toUpperCase();
  if (!C6_BOLEPIX_V2_REFERENCE_PATTERN.test(reference)) {
    throw new C6BolepixV2ValidationError(
      'A referência externa do Bolepix precisa ter 26 letras maiúsculas ou dígitos.',
      ['external_reference_id'],
    );
  }
  return reference;
}

export function buildC6BolepixV2CreateBody(
  input: C6BolepixV2CreateInput,
  now = new Date(),
): Record<string, unknown> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 5_000_000) {
    throw new C6BolepixV2ValidationError('O valor do Bolepix precisa ser maior que zero e até R$ 5.000.000,00.', [
      'amount',
    ]);
  }
  if (Number(amount.toFixed(2)) !== amount) {
    throw new C6BolepixV2ValidationError('O valor do Bolepix precisa ter no máximo duas casas decimais.', ['amount']);
  }
  const dueDate = String(input.dueDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw new C6BolepixV2ValidationError('O vencimento do Bolepix precisa estar em AAAA-MM-DD.', ['due_date']);
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
  if (dueDate < today) {
    throw new C6BolepixV2ValidationError('O vencimento do Bolepix não pode ser anterior a hoje.', ['due_date']);
  }
  const description = String(input.description || '').trim();
  if (!description || description.length > 100) {
    throw new C6BolepixV2ValidationError('A descrição do Bolepix é obrigatória e tem no máximo 100 caracteres.', [
      'description',
    ]);
  }
  const payer = input.payer;
  const name = String(payer?.name || '').trim();
  const taxId = String(payer?.taxId || '').replace(/\D/g, '');
  const address = String(payer?.address || '').trim();
  const neighborhood = String(payer?.neighborhood || '').trim();
  const city = String(payer?.city || '').trim();
  const state = String(payer?.state || '').trim().toUpperCase();
  const zipCode = String(payer?.zipCode || '').replace(/\D/g, '');
  if (!name || name.length > 40) {
    throw new C6BolepixV2ValidationError('O nome do pagador é obrigatório e tem no máximo 40 caracteres.', ['payer.name']);
  }
  if (taxId.length !== 11 && taxId.length !== 14) {
    throw new C6BolepixV2ValidationError('O documento do pagador precisa ter 11 ou 14 dígitos.', ['payer.tax_id']);
  }
  if (neighborhood.length > 40 || city.length > 40) {
    throw new C6BolepixV2ValidationError('Bairro e cidade do Bolepix têm no máximo 40 caracteres.', [
      'payer.address.neighborhood',
      'payer.address.city',
    ]);
  }
  if (!address || address.length > 40 || !neighborhood || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{8}$/.test(zipCode)) {
    throw new C6BolepixV2ValidationError(
      'O Bolepix exige logradouro, bairro, cidade, UF e CEP do pagador.',
      ['payer.address'],
    );
  }
  const scheme = c6BolepixV2BillingScheme(input.environment);
  if (scheme !== '15' && scheme !== '21') {
    throw new C6BolepixV2ValidationError('A carteira do Bolepix só pode ser 15 em produção ou 21 em sandbox.', [
      'billing_scheme',
    ]);
  }
  const bankSlip: Record<string, unknown> = { billing_scheme: scheme };
  const ourNumber = String(input.ourNumber || '').trim();
  if (ourNumber) {
    if (!/^\d{1,10}$/.test(ourNumber)) {
      throw new C6BolepixV2ValidationError('O Nosso Número informado precisa ter de 1 a 10 dígitos.', ['our_number']);
    }
    bankSlip.our_number = ourNumber;
  }
  const paymentMethod: Record<string, unknown> = { bank_slip: bankSlip };
  const pixKey = String(input.pixKey || '').trim();
  if (pixKey) {
    if (!EVP.test(pixKey)) {
      throw new C6BolepixV2ValidationError(
        'A chave Pix do Bolepix precisa ser aleatória (EVP). Sem chave válida, o Pix não é enviado.',
        ['payment_method.pix.key'],
      );
    }
    paymentMethod.pix = { type: C6_BOLEPIX_V2_PIX_KEY_TYPE, key: pixKey };
  }
  const body: Record<string, unknown> = {
    amount,
    due_date: dueDate,
    description,
    payer: {
      name,
      tax_id: taxId,
      address: { address, neighborhood, city, state, zip_code: zipCode },
    },
    payment_method: paymentMethod,
  };
  if (input.externalReferenceId) {
    body.external_reference_id = assertC6BolepixV2Reference(input.externalReferenceId);
  }
  const email = String(payer.email || '').trim();
  if (email) (body.payer as Record<string, unknown>).email = email;
  return body;
}
