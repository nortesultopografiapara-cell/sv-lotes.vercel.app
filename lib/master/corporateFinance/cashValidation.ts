import { CORPORATE_PAYMENT_METHODS } from './arApTypes';
import type {
  MasterCorporateCashMovementInput,
  MasterCorporateTransferInput,
} from './cashTypes';

function parseMoney(value: unknown, field: string): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`${field} inválido.`);
  if (n <= 0) throw new Error(`${field} deve ser maior que zero.`);
  return Math.round(n * 100) / 100;
}

function requireDate(value: unknown, field: string): string {
  const s = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`${field} inválida.`);
  return s;
}

function optionalStr(value: unknown, max = 500): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function validateManualCashMovementInput(
  body: Record<string, unknown>,
): MasterCorporateCashMovementInput {
  const type = String(body.type || '').toUpperCase();
  if (type !== 'INCOME' && type !== 'EXPENSE') {
    throw new Error('Tipo deve ser INCOME ou EXPENSE.');
  }
  const description = String(body.description || '').trim();
  if (!description) throw new Error('Descrição é obrigatória.');

  const financial_account_id = String(body.financial_account_id || '').trim();
  if (!financial_account_id) throw new Error('Conta financeira é obrigatória.');

  const category_id = String(body.category_id || '').trim();
  if (!category_id) throw new Error('Categoria é obrigatória.');

  let payment_method: string | null = optionalStr(body.payment_method, 40);
  if (payment_method) {
    const up = payment_method.toUpperCase();
    if (!(CORPORATE_PAYMENT_METHODS as readonly string[]).includes(up)) {
      throw new Error('Forma de pagamento inválida.');
    }
    payment_method = up;
  }

  return {
    movement_date: requireDate(body.movement_date, 'Data'),
    competence_date: requireDate(
      body.competence_date || body.movement_date,
      'Competência',
    ),
    type,
    amount: parseMoney(body.amount, 'Valor'),
    description: description.slice(0, 500),
    financial_account_id,
    category_id,
    cost_center_id: optionalStr(body.cost_center_id, 80),
    project_id: optionalStr(body.project_id, 80),
    payment_method,
    reference: optionalStr(body.reference, 200),
    notes: optionalStr(body.notes, 2000),
  };
}

export function validateTransferInput(
  body: Record<string, unknown>,
): MasterCorporateTransferInput {
  const from_account_id = String(body.from_account_id || '').trim();
  const to_account_id = String(body.to_account_id || '').trim();
  if (!from_account_id || !to_account_id) {
    throw new Error('Contas de origem e destino são obrigatórias.');
  }
  if (from_account_id === to_account_id) {
    throw new Error('Conta de origem e destino devem ser distintas.');
  }
  return {
    from_account_id,
    to_account_id,
    movement_date: requireDate(body.movement_date, 'Data'),
    amount: parseMoney(body.amount, 'Valor'),
    notes: optionalStr(body.notes, 2000),
  };
}
