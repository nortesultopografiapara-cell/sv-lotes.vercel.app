import {
  isOperationExpenseCategory,
  type MasterTopographyOperationExpenseInput,
} from './operationExpenseTypes';

function cleanText(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, max);
}

export function validateOperationExpenseInput(
  raw: Record<string, unknown>,
): MasterTopographyOperationExpenseInput {
  const description = cleanText(raw.description, 500);
  if (!description) throw new Error('Descrição da despesa é obrigatória.');

  const category = String(raw.category || 'OUTROS').trim();
  if (!isOperationExpenseCategory(category)) throw new Error('Categoria inválida.');

  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor da despesa deve ser positivo.');
  }

  const dateRaw = String(raw.expense_date ?? raw.expenseDate ?? '').trim();
  const expense_date = dateRaw
    ? dateRaw.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expense_date)) {
    throw new Error('Data da despesa inválida.');
  }

  let receipt: string | null = null;
  const rd = raw.receipt_document_id ?? raw.receiptDocumentId;
  if (rd != null && String(rd).trim()) {
    const s = String(rd).trim();
    if (!/^[0-9a-f-]{36}$/i.test(s)) throw new Error('Comprovante inválido.');
    receipt = s;
  }

  return {
    category,
    description,
    amount: Math.round(amount * 100) / 100,
    expense_date,
    supplier: cleanText(raw.supplier, 200),
    payment_method: cleanText(raw.payment_method ?? raw.paymentMethod, 80),
    receipt_document_id: receipt,
    notes: cleanText(raw.notes, 2000),
  };
}
