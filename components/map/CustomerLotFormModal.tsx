'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CustomerSearchPicker } from '@/components/customers/CustomerSearchPicker';
import {
  customerToFormValues,
  emptyCustomerFormValues,
  loadCustomerById,
  type CustomerFormValues,
} from '@/lib/customerIdentity';
import {
  validateCustomerForContract,
  type CustomerContractValidation,
} from '@/lib/validateCustomerForContract';
import {
  DocumentFieldFeedback,
  documentFieldInputClass,
} from '@/components/customers/DocumentFieldFeedback';
import { useCustomerDocumentAutofill } from '@/hooks/useCustomerDocumentAutofill';

export type LotFormState = CustomerFormValues & {
  payment_type: string;
  discount_value: string;
  down_payment: string;
  down_payment_due_date: string;
  installments_count: string;
  first_installment_due_date: string;
  broker_id: string;
  notes: string;
};

export type LotFormConfirmPayload = LotFormState & {
  lot_value: number;
  final_value: number;
  installment_value: number;
};

/** Campos legíveis em modais GIS (fundo claro; evita herdar text-white do tema global). */
const GIS_INPUT =
  'form-input-light w-full px-3 py-2 rounded-lg text-sm disabled:cursor-not-allowed';
const GIS_INPUT_DATE =
  'form-input-light w-full px-3 py-2 rounded-lg text-sm [color-scheme:light] disabled:cursor-not-allowed';
const GIS_INPUT_READONLY =
  'form-input-light w-full px-3 py-2 rounded-lg text-sm bg-slate-100 text-slate-700 border-slate-300 cursor-not-allowed';

function emptyLotFormState(): LotFormState {
  return {
    ...emptyCustomerFormValues(),
    payment_type: 'À vista',
    discount_value: '',
    down_payment: '',
    down_payment_due_date: '',
    installments_count: '1',
    first_installment_due_date: '',
    broker_id: '',
    notes: '',
  };
}

type Props = {
  lot: {
    id: string;
    block: string;
    number: string;
    status?: string;
    customerId?: string | null;
    project_id?: string | null;
    signal_amount?: number | null;
    signal_date?: string | null;
    signal_payment_method?: string | null;
    signal_notes?: string | null;
  };
  actionName: string;
  price: number;
  tenantId: string | null;
  isSuperAdmin: boolean;
  prefillFromReservation?: boolean;
  mode?: 'create' | 'edit';
  initialFormData?: Partial<LotFormState>;
  brokers?: { id: string; name: string }[];
  onClose: () => void;
  onConfirm: (data: LotFormConfirmPayload) => Promise<void>;
  onCustomerValidationFailed?: (validation: CustomerContractValidation) => void;
};

export function CustomerLotFormModal({
  lot,
  actionName,
  price,
  tenantId,
  isSuperAdmin,
  prefillFromReservation,
  mode = 'create',
  initialFormData,
  brokers = [],
  onClose,
  onConfirm,
  onCustomerValidationFailed,
}: Props) {
  const isEditMode = mode === 'edit';
  const [formData, setFormData] = useState<LotFormState>(() => ({
    ...emptyLotFormState(),
    ...initialFormData,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillBanner, setPrefillBanner] = useState<string | null>(
    isEditMode ? 'Dados da venda carregados para edição.' : null,
  );

  useEffect(() => {
    if (initialFormData) {
      setFormData((prev) => ({ ...prev, ...initialFormData }));
    }
  }, [initialFormData]);

  useEffect(() => {
    let cancelled = false;

    async function loadPrefill() {
      if (isEditMode) return;
      const customerId = lot.customerId;
      if (!prefillFromReservation || !customerId) return;

      setPrefillLoading(true);
      try {
        console.log('RESERVATION_LOADED', { blockId: lot.id, customerId });

        const customer = await loadCustomerById(supabase, customerId);
        if (!customer || cancelled) return;

        let signalAmount = lot.signal_amount;
        let signalDate = lot.signal_date;
        let signalMethod = lot.signal_payment_method;
        let signalNotes = lot.signal_notes;

        const { data: blockRow } = await supabase
          .from('blocks')
          .select(
            'customer_id, signal_amount, signal_date, signal_payment_method, signal_notes, status',
          )
          .eq('id', lot.id)
          .maybeSingle();

        if (blockRow) {
          signalAmount = blockRow.signal_amount ?? signalAmount;
          signalDate = blockRow.signal_date ?? signalDate;
          signalMethod = blockRow.signal_payment_method ?? signalMethod;
          signalNotes = blockRow.signal_notes ?? signalNotes;
        }

        const { data: reservationLog } = await supabase
          .from('reservation_logs')
          .select('customer_id, signal_amount, signal_date, signal_payment_method, signal_notes')
          .eq('block_id', lot.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (reservationLog) {
          signalAmount = reservationLog.signal_amount ?? signalAmount;
          signalDate = reservationLog.signal_date ?? signalDate;
          signalMethod = reservationLog.signal_payment_method ?? signalMethod;
          signalNotes = reservationLog.signal_notes ?? signalNotes;
        }

        const paidSignal = Number(signalAmount) || 0;
        const next: LotFormState = {
          ...emptyLotFormState(),
          ...customerToFormValues(customer),
          signal_amount: paidSignal > 0 ? String(paidSignal) : '',
          signal_date: signalDate ? String(signalDate).split('T')[0] : '',
          signal_payment_method: signalMethod || '',
          signal_notes: signalNotes || '',
          reservation_signal_paid: paidSignal,
        };

        if (actionName === 'Vendido' && paidSignal > 0) {
          next.down_payment = String(paidSignal);
          next.payment_type = 'Parcelado';
        }

        if (!cancelled) {
          setFormData(next);
          setPrefillBanner(
            `Dados carregados da reserva: ${customer.name || ''}${
              paidSignal > 0 ? ` · Sinal R$ ${paidSignal.toFixed(2)}` : ''
            }`,
          );
          console.log('CUSTOMER_REUSED_FROM_RESERVATION', { customerId });
          console.log('SALE_FORM_PREFILLED', { customerId, paidSignal });
        }
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    }

    void loadPrefill();
    return () => {
      cancelled = true;
    };
  }, [lot.id, lot.customerId, lot.signal_amount, prefillFromReservation, actionName, isEditMode]);

  const discountValue = Number(formData.discount_value) || 0;
  const paymentType = formData.payment_type || 'À vista';
  const downPaymentStr = formData.down_payment || '';
  const installmentsCountStr = formData.installments_count || '1';

  const finalValue = Math.max(0, price - discountValue);
  const downPayment = Number(downPaymentStr) || 0;
  const installmentsCount = Math.max(1, Number(installmentsCountStr) || 1);
  const installmentValue = Math.max(0, (price - downPayment) / installmentsCount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (actionName === 'Vendido' || isEditMode) {
      if (paymentType === 'À vista') {
        if (discountValue > price) {
          alert('O desconto não pode ser maior que o valor do lote.');
          return;
        }
        if (finalValue <= 0) {
          alert('O valor final não pode ser zero ou negativo.');
          return;
        }
        if (!formData.down_payment_due_date) {
          alert('Por favor, preencha a data de vencimento.');
          return;
        }
      } else {
        if (downPayment > price) {
          alert('A entrada não pode ser maior que o valor do lote.');
          return;
        }
        if (installmentsCount <= 0) {
          alert('A quantidade de parcelas deve ser maior que 0.');
          return;
        }
        if (downPayment > 0 && !formData.down_payment_due_date) {
          alert('Por favor, preencha a data de vencimento da entrada.');
          return;
        }
        if (!formData.first_installment_due_date) {
          alert('Por favor, preencha a data de vencimento da primeira parcela.');
          return;
        }
      }
    }

    if (actionName === 'Vendido' || isEditMode) {
      const validation = validateCustomerForContract({
        ...formData,
        id: formData.selected_customer_id || undefined,
        civil_state: formData.civil_state,
        marital_status: formData.civil_state,
      });
      if (!validation.valid) {
        onCustomerValidationFailed?.(validation);
        return;
      }
    }

    setSubmitting(true);
    try {
      await onConfirm({
        ...formData,
        payment_type: paymentType,
        down_payment: downPaymentStr,
        installments_count: installmentsCountStr,
        lot_value: price,
        final_value: finalValue,
        installment_value: installmentValue,
      });
    } catch (err) {
      console.error('CUSTOMER_LOT_FORM_SUBMIT_ERROR', err);
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (patch: Partial<LotFormState>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const {
    cpfCnpjValidation,
    cepValidation,
    cepLookupMessage,
    cnpjLookupMessage,
    handleCpfCnpjChange,
    handleCepChange,
  } = useCustomerDocumentAutofill({
    formData,
    setFormData,
    disabled: submitting || prefillLoading,
    fields: {
      cpf_cnpj: 'cpf_cnpj',
      name: 'name',
      address: 'address',
      neighborhood: 'neighborhood',
      city: 'city',
      state_uf: 'state_uf',
      zip_code: 'zip_code',
      email: 'email',
      phone: 'phone',
    },
  });

  const onCustomerFormChange = (data: CustomerFormValues) => {
    setFormData((prev) => ({ ...prev, ...data }));
  };

  const title = isEditMode
    ? 'Editar Venda do Lote'
    : formData.selected_customer_id || prefillFromReservation
      ? actionName === 'Vendido'
        ? 'Venda de Lote'
        : 'Reserva de Lote'
      : `Novo Cliente${actionName === 'Vendido' ? ' - Venda de Lote' : ''}`;

  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto sm:p-4 font-sans">
      <div className="bg-white w-full max-w-2xl overflow-hidden animate-in fade-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in duration-200 flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:rounded-xl">
        <div className="sticky top-0 z-20 p-4 border-b border-gray-100 flex items-center justify-between bg-white flex-none shadow-sm">
          <div>
            <h3 className="font-bold text-lg text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">
              Lote {lot.number} - Quadra {lot.block} ({actionName})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="gis-commercial-modal flex-1 overflow-y-auto p-5 text-slate-900">
          {prefillLoading && (
            <div className="mb-4 flex items-center gap-2 text-sm text-blue-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando dados da reserva...
            </div>
          )}
          {prefillBanner && (
            <div className="mb-4 p-3 text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg">
              {prefillBanner}
            </div>
          )}

          <form id="customer-lot-form" onSubmit={handleSubmit} className="space-y-6">
            {!isEditMode && (
              <CustomerSearchPicker
                tenantId={tenantId}
                isSuperAdmin={isSuperAdmin}
                formData={formData}
                onFormChange={onCustomerFormChange}
                disabled={submitting || prefillLoading}
              />
            )}

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-gray-900 border-b pb-1">DADOS DO CLIENTE</h4>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nome Completo *</label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={(e) => setField({ name: e.target.value })}
                  className={GIS_INPUT}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">CPF / CNPJ</label>
                  <input
                    type="text"
                    value={formData.cpf_cnpj}
                    onChange={(e) => handleCpfCnpjChange(e.target.value)}
                    placeholder="000.000.000-00"
                    className={documentFieldInputClass(GIS_INPUT, cpfCnpjValidation.tone)}
                  />
                  <DocumentFieldFeedback
                    message={cpfCnpjValidation.message}
                    tone={cpfCnpjValidation.tone}
                    lookupMessage={cnpjLookupMessage}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">RG</label>
                  <input
                    type="text"
                    value={formData.rg}
                    onChange={(e) => setField({ rg: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Órgão emissor</label>
                  <input
                    type="text"
                    value={formData.rg_issuer}
                    onChange={(e) => setField({ rg_issuer: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">UF emissor</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={formData.rg_issuer_state}
                    onChange={(e) => setField({ rg_issuer_state: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Telefone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setField({ phone: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setField({ email: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Profissão</label>
                  <input
                    type="text"
                    value={formData.profession}
                    onChange={(e) => setField({ profession: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Estado Civil</label>
                  <select
                    value={formData.civil_state}
                    onChange={(e) => setField({ civil_state: e.target.value })}
                    className={GIS_INPUT}
                  >
                    <option value="">Selecione...</option>
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                    <option value="União Estável">União Estável</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Endereço</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setField({ address: e.target.value })}
                  className={GIS_INPUT}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Bairro</label>
                  <input
                    type="text"
                    value={formData.neighborhood}
                    onChange={(e) => setField({ neighborhood: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setField({ city: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={formData.state_uf}
                    onChange={(e) => setField({ state_uf: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">CEP</label>
                  <input
                    type="text"
                    value={formData.zip_code}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00.000-000"
                    className={documentFieldInputClass(GIS_INPUT, cepValidation.tone)}
                  />
                  <DocumentFieldFeedback
                    message={cepValidation.message}
                    tone={cepValidation.tone}
                    lookupMessage={cepLookupMessage}
                  />
                </div>
              </div>
            </div>

            {actionName === 'Reservado' && (
              <div className="space-y-4 bg-amber-50 p-4 rounded-lg border border-amber-100">
                <h4 className="text-sm font-bold text-gray-900 border-b pb-1">SINAL DA RESERVA</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Valor do sinal (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.signal_amount || ''}
                      onChange={(e) => setField({ signal_amount: e.target.value })}
                      className={GIS_INPUT}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Data do sinal</label>
                    <input
                      type="date"
                      value={formData.signal_date || ''}
                      onChange={(e) => setField({ signal_date: e.target.value })}
                      className={GIS_INPUT_DATE}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Forma de pagamento</label>
                    <input
                      type="text"
                      value={formData.signal_payment_method || ''}
                      onChange={(e) => setField({ signal_payment_method: e.target.value })}
                      className={GIS_INPUT}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Observações</label>
                    <input
                      type="text"
                      value={formData.signal_notes || ''}
                      onChange={(e) => setField({ signal_notes: e.target.value })}
                      className={GIS_INPUT}
                    />
                  </div>
                </div>
              </div>
            )}

            {(actionName === 'Vendido' || isEditMode) && (
              <div className="space-y-4 bg-gray-50 p-4 rounded-lg border border-gray-100">
                <h4 className="text-sm font-bold text-gray-900 border-b pb-1">DADOS DA VENDA</h4>
                {(formData.reservation_signal_paid || 0) > 0 && (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                    Sinal da reserva: R$ {Number(formData.reservation_signal_paid).toFixed(2)} — será
                    descontado da entrada na venda.
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Valor do Lote</label>
                    <input
                      readOnly
                      type="text"
                      value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}
                      className={`${GIS_INPUT_READONLY} font-medium`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Forma de Pagamento</label>
                    <select
                      value={paymentType}
                      onChange={(e) => setField({ payment_type: e.target.value })}
                      className={GIS_INPUT}
                    >
                      <option value="À vista">À vista</option>
                      <option value="Parcelado">Parcelado</option>
                    </select>
                  </div>
                </div>
                {paymentType === 'À vista' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Desconto (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.discount_value}
                        onChange={(e) => setField({ discount_value: e.target.value })}
                        className={GIS_INPUT}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Valor Final</label>
                      <input
                        readOnly
                        type="text"
                        value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(finalValue)}
                        className={`${GIS_INPUT_READONLY} font-bold text-green-700`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Data de Vencimento *</label>
                      <input
                        type="date"
                        required
                        value={formData.down_payment_due_date}
                        onChange={(e) => setField({ down_payment_due_date: e.target.value })}
                        className={GIS_INPUT_DATE}
                      />
                    </div>
                  </div>
                )}
                {paymentType === 'Parcelado' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Valor da Entrada (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={downPaymentStr}
                        onChange={(e) => setField({ down_payment: e.target.value })}
                        className={GIS_INPUT}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Venc. Entrada</label>
                      <input
                        type="date"
                        required={downPayment > 0}
                        value={formData.down_payment_due_date}
                        onChange={(e) => setField({ down_payment_due_date: e.target.value })}
                        className={GIS_INPUT_DATE}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Qtd de Parcelas *</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={installmentsCountStr}
                        onChange={(e) => setField({ installments_count: e.target.value })}
                        className={GIS_INPUT}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Vencimento 1ª Parcela *</label>
                      <input
                        type="date"
                        required
                        value={formData.first_installment_due_date}
                        onChange={(e) => setField({ first_installment_due_date: e.target.value })}
                        className={GIS_INPUT_DATE}
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Corretor</label>
                    <select
                      value={formData.broker_id}
                      onChange={(e) => setField({ broker_id: e.target.value })}
                      className={GIS_INPUT}
                    >
                      <option value="">Nenhum / não informado</option>
                      {brokers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Observações</label>
                    <textarea
                      rows={2}
                      value={formData.notes}
                      onChange={(e) => setField({ notes: e.target.value })}
                      className={`${GIS_INPUT} resize-none`}
                      placeholder="Observações da venda"
                    />
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="sticky bottom-0 z-20 p-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-1/2 px-4 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="customer-lot-form"
            disabled={submitting || prefillLoading}
            className={`w-full sm:w-1/2 px-4 py-3 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 ${
              actionName === 'Reservado' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'
            } disabled:opacity-50`}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isEditMode ? (
              'Salvar'
            ) : actionName === 'Vendido' ? (
              'Confirmar Venda'
            ) : (
              'Confirmar Reserva'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
