'use client';

import { AlertTriangle, X } from 'lucide-react';
import {
  customerEditUrl,
  type CustomerContractValidation,
} from '@/lib/validateCustomerForContract';

type Props = {
  open: boolean;
  validation: CustomerContractValidation | null;
  onClose: () => void;
  onOpenCustomer?: (customerId: string) => void;
};

export function CustomerContractValidationModal({
  open,
  validation,
  onClose,
  onOpenCustomer,
}: Props) {
  if (!open || !validation) return null;

  const pending = validation.missingRequired.length
    ? validation.missingRequired
    : validation.missingFields;

  const handleOpenCustomer = () => {
    if (!validation.customerId) return;
    if (onOpenCustomer) {
      onOpenCustomer(validation.customerId);
      return;
    }
    window.open(customerEditUrl(validation.customerId), '_blank');
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white text-gray-900 rounded-xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 border-b border-amber-200 bg-amber-50 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-base text-amber-900">ATENÇÃO</h3>
              <p className="text-sm text-amber-800 mt-1 leading-snug">
                Existem dados obrigatórios do comprador não preenchidos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-800 rounded-full hover:bg-amber-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">
              Campos pendentes:
            </p>
            <ul className="space-y-1 text-sm text-gray-700">
              {pending.map((field) => (
                <li key={field} className="flex items-center gap-2">
                  <span className="text-amber-600">•</span>
                  {field}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Complete o cadastro do cliente antes de gerar ou regenerar o
            contrato.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-gray-50"
            >
              Fechar
            </button>
            {validation.customerId && (
              <button
                type="button"
                onClick={handleOpenCustomer}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
              >
                Abrir Cadastro do Cliente
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
