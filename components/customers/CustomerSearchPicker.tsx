'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Search, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  customerToFormValues,
  emptyCustomerFormValues,
  searchCustomers,
  type CustomerFormValues,
  type CustomerRecord,
} from '@/lib/customerIdentity';

type Props = {
  tenantId: string | null;
  isSuperAdmin: boolean;
  formData: CustomerFormValues;
  onFormChange: (data: CustomerFormValues) => void;
  disabled?: boolean;
  /** false esconde o atalho redundante quando o formulário já cadastra o cliente. */
  showCreateNewButton?: boolean;
  compact?: boolean;
};

export function CustomerSearchPicker({
  tenantId,
  isSuperAdmin,
  formData,
  onFormChange,
  disabled,
  showCreateNewButton = true,
  compact = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<'search' | 'new'>(
    formData.selected_customer_id ? 'search' : 'search',
  );

  const selectedLabel = formData.selected_customer_id && formData.name;

  const runSearch = useCallback(
    async (text: string) => {
      if (text.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const rows = await searchCustomers(supabase, {
          query: text,
          tenantId,
          isSuperAdmin,
        });
        setResults(rows);
      } finally {
        setSearching(false);
      }
    },
    [tenantId, isSuperAdmin],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(query);
    }, 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const selectCustomer = (customer: CustomerRecord) => {
    console.log('CUSTOMER_SELECTED', { id: customer.id, name: customer.name });
    onFormChange({
      ...customerToFormValues(customer),
      signal_amount: formData.signal_amount,
      signal_date: formData.signal_date,
      signal_payment_method: formData.signal_payment_method,
      signal_notes: formData.signal_notes,
      reservation_signal_paid: formData.reservation_signal_paid,
    });
    setQuery('');
    setResults([]);
    setMode('search');
  };

  const startNewCustomer = () => {
    onFormChange({
      ...emptyCustomerFormValues(),
      signal_amount: formData.signal_amount,
      signal_date: formData.signal_date,
      signal_payment_method: formData.signal_payment_method,
      signal_notes: formData.signal_notes,
      reservation_signal_paid: formData.reservation_signal_paid,
    });
    setMode('new');
    setQuery('');
    setResults([]);
  };

  const clearSelection = () => {
    onFormChange({
      ...emptyCustomerFormValues(),
      signal_amount: formData.signal_amount,
      signal_date: formData.signal_date,
      signal_payment_method: formData.signal_payment_method,
      signal_notes: formData.signal_notes,
      reservation_signal_paid: formData.reservation_signal_paid,
    });
    setMode('search');
  };

  return (
    <div
      className={`${compact ? 'space-y-2 p-3' : 'space-y-3 p-4'} bg-blue-50/80 border border-blue-100 rounded-lg`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-gray-900`}>
          Buscar cliente existente
        </h4>
        {showCreateNewButton ? (
          <button
            type="button"
            disabled={disabled}
            onClick={startNewCustomer}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Cadastrar novo cliente
          </button>
        ) : null}
      </div>

      {selectedLabel ? (
        <div className="p-3 bg-white border border-blue-200 rounded-lg text-sm">
          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-1">
            Cliente selecionado
          </p>
          <p className="font-bold text-gray-900">{formData.name}</p>
          <p className="text-gray-600 text-xs mt-1">
            {formData.cpf_cnpj || '—'} · {formData.phone || '—'} · {formData.email || '—'}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={clearSelection}
            className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
          >
            Trocar cliente
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              disabled={disabled || mode === 'new'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite nome, CPF, telefone ou e-mail..."
              className="form-input-light w-full pl-9 pr-9 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {searching && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Buscando...
            </div>
          )}

          {results.length > 0 && (
            <ul className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors"
                  >
                    <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">
                      {c.cpf_cnpj || c.document || '—'} · {c.phone || '—'} · {c.email || '—'}
                    </p>
                    <span className="text-[10px] font-bold text-blue-600 mt-1 inline-block">
                      Usar este cliente
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {mode === 'new' && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              Modo cadastro novo — preencha os dados abaixo.
            </p>
          )}
        </>
      )}
    </div>
  );
}
