export const OPERATION_EXPENSE_CATEGORIES = [
  { code: 'COMBUSTIVEL', label: 'Combustível' },
  { code: 'HOSPEDAGEM', label: 'Hospedagem' },
  { code: 'ALIMENTACAO', label: 'Alimentação' },
  { code: 'PEDAGIO', label: 'Pedágio' },
  { code: 'DIARIA', label: 'Diária' },
  { code: 'MANUTENCAO_EMERGENCIAL', label: 'Manutenção emergencial' },
  { code: 'ALUGUEL', label: 'Aluguel' },
  { code: 'MATERIAL', label: 'Material' },
  { code: 'OUTROS', label: 'Outros' },
] as const;

export type OperationExpenseCategory =
  (typeof OPERATION_EXPENSE_CATEGORIES)[number]['code'];

export function isOperationExpenseCategory(v: string): v is OperationExpenseCategory {
  return OPERATION_EXPENSE_CATEGORIES.some((c) => c.code === v);
}

export function operationExpenseCategoryLabel(code: string): string {
  return OPERATION_EXPENSE_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

export type MasterTopographyOperationExpense = {
  id: string;
  operation_id: string;
  category: OperationExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  supplier: string | null;
  payment_method: string | null;
  receipt_document_id: string | null;
  payable_id: string | null;
  notes: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MasterTopographyOperationExpenseInput = {
  category: OperationExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  supplier?: string | null;
  payment_method?: string | null;
  receipt_document_id?: string | null;
  notes?: string | null;
};
