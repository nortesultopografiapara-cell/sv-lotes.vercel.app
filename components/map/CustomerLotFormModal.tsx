'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CustomerSearchPicker } from '@/components/customers/CustomerSearchPicker';
import { SaleDocumentsPanel } from '@/components/sales/SaleDocumentsPanel';
import {
  customerToFormValues,
  emptyCustomerFormValues,
  loadCustomerById,
  type CustomerFormValues,
} from '@/lib/customerIdentity';
import { validateOptionalCustomerEmail, validateSaleLotFormSubmission } from '@/lib/saleLotFormValidation';
import {
  type CustomerContractValidation,
} from '@/lib/validateCustomerForContract';
import {
  DocumentFieldFeedback,
  documentFieldInputClass,
} from '@/components/customers/DocumentFieldFeedback';
import { useCustomerDocumentAutofill } from '@/hooks/useCustomerDocumentAutofill';
import { InstallmentsCountCombobox } from '@/components/map/InstallmentsCountCombobox';
import { validateInstallmentsCount } from '@/lib/installmentsCount';
import {
  emptySaleSpouseFormFields,
  type SaleSpouseFormFields,
} from '@/lib/saleSpouseFields';
import {
  formatSpouseCpf,
  getSpouseCpfValidationState,
} from '@/lib/saleSpouseCpf';
import {
  applySpouseSuggestionToForm,
  clearSpouseFormFields,
  saleSpouseFormHasContent,
  type CustomerSpouseSuggestion,
} from '@/lib/customerSpouses';
import { listCustomerSpouseSuggestions } from '@/lib/customerSpousesService';
import {
  computeInstallmentDisplayValue,
  downPaymentReducesInstallmentBase,
  resolveInstallmentPrincipal,
  splitInstallmentAmounts,
} from '@/lib/saleInstallmentCalc';
import {
  applySignalAddonToInstallmentAmounts,
  resolveRecantoSignalPlan,
  validateRecantoSignalPlan,
  type SignalRemainingPaymentMode,
} from '@/lib/recantoSignalRemaining';
import {
  applyBalloonToInstallmentAmounts,
  emptyBalloonFormConfig,
  resolveSaleBalloonPlan,
  validateSaleBalloonConfiguration,
  type SaleBalloonFormConfig,
} from '@/lib/saleBalloonInstallments';
import {
  DEFAULT_INSTALLMENT_CORRECTION_TYPE,
  INSTALLMENT_CORRECTION_OPTIONS,
  normalizeInstallmentCorrectionType,
} from '@/lib/installmentCorrectionType';
import type { SaleContractModel } from '@/lib/contractModel';
import {
  formatCurrencyBRL,
  parseCurrencyBRLNumber,
  serializeCurrencyBRL,
} from '@/lib/currencyBrl';
import {
  formatFinancialAccountLabel,
  type CompanyFinancialAccountResponse,
} from '@/lib/finance/companyFinancialAccountTypes';
import { isTenantEnterpriseAdminRole } from '@/lib/rolePermissions';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { SaleBalloonInstallmentsPanel } from '@/components/map/SaleBalloonInstallmentsPanel';
import {
  PAYMENT_TYPE_INSTALLMENT,
  resolveSalePaymentMode,
  salePaymentModeSelectOptions,
} from '@/lib/salePaymentMode';
import { formatContractDueDateBr } from '@/lib/contractPaymentDates';
import {
  formatBrokerCommissionPreview,
  normalizeBrokerCommissionMode,
  resolveBrokerDefaultCommissionPlan,
  resolveSaleCommissionPlan,
  type BrokerCommissionMode,
} from '@/lib/brokerCommissionMode';

export type LotFormState = CustomerFormValues &
  SaleSpouseFormFields & {
  payment_type: string;
  discount_value: string;
  down_payment: string;
  down_payment_due_date: string;
  installments_count: string;
  first_installment_due_date: string;
  broker_id: string;
  /** true = herda modelo do cadastro do corretor */
  use_broker_default_commission: boolean;
  sale_commission_mode: BrokerCommissionMode;
  sale_commission_percent: number;
  sale_commission_fixed_amount: string;
  financial_account_id: string;
  notes: string;
  installment_correction_type: string;
  signal_amount?: string;
  signal_date?: string;
  signal_payment_method?: string;
  signal_notes?: string;
  reservation_signal_paid?: number;
  /** Recanto: sinal contratado (espelha down_payment). */
  signal_contract_value?: string;
  /** Recanto: valor pago no ato do sinal. */
  signal_paid_at_sale?: string;
  /** Recanto: FIRST_INSTALLMENTS | ALL_INSTALLMENTS */
  signal_remaining_payment_mode?: SignalRemainingPaymentMode | '';
  /** Recanto: qtd de parcelas para o restante (primeiras parcelas). */
  signal_remaining_installments?: string;
  /** Parcelas balão (opcional) — desligado = fluxo idêntico ao atual. */
  use_balloon_installments?: boolean;
  balloon_config?: SaleBalloonFormConfig | null;
  balloon_locked?: boolean;
  /** Atualiza customer_spouses para compras futuras (não altera vendas antigas). */
  update_spouse_registry?: boolean;
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
    ...emptySaleSpouseFormFields(),
    payment_type: 'À vista',
    discount_value: '',
    down_payment: '',
    down_payment_due_date: '',
    installments_count: '',
    first_installment_due_date: '',
    broker_id: '',
    use_broker_default_commission: true,
    sale_commission_mode: 'PERCENT',
    sale_commission_percent: 0,
    sale_commission_fixed_amount: '',
    financial_account_id: '',
    notes: '',
    installment_correction_type: DEFAULT_INSTALLMENT_CORRECTION_TYPE,
    signal_contract_value: '',
    signal_paid_at_sale: '',
    signal_remaining_payment_mode: 'FIRST_INSTALLMENTS',
    signal_remaining_installments: '',
    use_balloon_installments: false,
    balloon_config: emptyBalloonFormConfig(),
    balloon_locked: false,
    update_spouse_registry: false,
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
    saleId?: string | null;
    signal_amount?: number | null;
    signal_date?: string | null;
    signal_payment_method?: string | null;
    signal_notes?: string | null;
  };
  actionName: string;
  price: number;
  tenantId: string | null;
  isSuperAdmin: boolean;
  userRole?: string | null;
  prefillFromReservation?: boolean;
  mode?: 'create' | 'edit';
  initialFormData?: Partial<LotFormState>;
  brokers?: {
    id: string;
    name: string;
    commission_percent?: number | string | null;
    commission_mode?: string | null;
    commission_fixed_amount?: number | string | null;
  }[];
  contractModel?: SaleContractModel | string | null;
  /** Venda existente — necessário para a aba Documentos. */
  saleId?: string | null;
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
  userRole = null,
  prefillFromReservation,
  mode = 'create',
  initialFormData,
  brokers = [],
  contractModel = 'PADRAO',
  saleId = null,
  onClose,
  onConfirm,
  onCustomerValidationFailed,
}: Props) {
  const isEditMode = mode === 'edit';
  const [activeTab, setActiveTab] = useState<'dados' | 'documentos'>('dados');
  const [formData, setFormData] = useState<LotFormState>(() => ({
    ...emptyLotFormState(),
    ...initialFormData,
  }));
  const [submitting, setSubmitting] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillBanner, setPrefillBanner] = useState<string | null>(
    isEditMode ? 'Dados da venda carregados para edição.' : null,
  );
  const [financialAccounts, setFinancialAccounts] = useState<CompanyFinancialAccountResponse[]>([]);
  const [financialAccountsLoading, setFinancialAccountsLoading] = useState(false);
  const [financialAccountsUnavailable, setFinancialAccountsUnavailable] = useState(false);
  const [spouseSuggestions, setSpouseSuggestions] = useState<CustomerSpouseSuggestion[]>([]);
  const [spouseSuggestionsLoading, setSpouseSuggestionsLoading] = useState(false);
  const [spouseReuseFromPrior, setSpouseReuseFromPrior] = useState(false);
  const canEditFinancialAccount =
    isSuperAdmin || isTenantEnterpriseAdminRole(userRole);

  useEffect(() => {
    if (initialFormData) {
      setFormData((prev) => ({ ...prev, ...initialFormData }));
    }
  }, [initialFormData]);

  useEffect(() => {
    let cancelled = false;

    async function loadFinancialAccounts() {
      if (!tenantId) return;
      setFinancialAccountsLoading(true);
      setFinancialAccountsUnavailable(false);
      try {
        const [accountsRes, projectRes] = await Promise.all([
          fetch('/api/finance/financial-accounts', { credentials: 'include' }),
          lot.project_id
            ? supabase
                .from('projects')
                .select('financial_account_id')
                .eq('id', lot.project_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (cancelled) return;

        if (accountsRes.status === 403 || accountsRes.status === 404) {
          setFinancialAccounts([]);
          setFinancialAccountsUnavailable(true);
          return;
        }

        const accountsJson = await accountsRes.json().catch(() => ({}));
        const accounts = accountsRes.ok
          ? ((accountsJson.accounts as CompanyFinancialAccountResponse[]) ?? [])
          : [];
        setFinancialAccounts(accounts);

        const projectAccountId = String(
          (projectRes.data as { financial_account_id?: string } | null)?.financial_account_id || '',
        );
        const defaultAccount =
          accounts.find((account) => account.isDefault) || accounts[0] || null;
        const resolvedAccountId = projectAccountId || defaultAccount?.id || '';

        if (resolvedAccountId) {
          setFormData((prev) =>
            prev.financial_account_id
              ? prev
              : { ...prev, financial_account_id: resolvedAccountId },
          );
        }
      } catch {
        if (!cancelled) setFinancialAccounts([]);
      } finally {
        if (!cancelled) setFinancialAccountsLoading(false);
      }
    }

    void loadFinancialAccounts();
    return () => {
      cancelled = true;
    };
  }, [tenantId, lot.project_id]);

  useEffect(() => {
    let cancelled = false;
    async function loadSpouseSuggestions() {
      const customerId = String(
        formData.selected_customer_id || lot.customerId || '',
      ).trim();
      if (!tenantId || !customerId || !(actionName === 'Vendido' || isEditMode)) {
        setSpouseSuggestions([]);
        return;
      }
      setSpouseSuggestionsLoading(true);
      try {
        const list = await listCustomerSpouseSuggestions(supabase, {
          companyId: tenantId,
          customerId,
        });
        if (!cancelled) setSpouseSuggestions(list);
      } catch {
        if (!cancelled) setSpouseSuggestions([]);
      } finally {
        if (!cancelled) setSpouseSuggestionsLoading(false);
      }
    }
    void loadSpouseSuggestions();
    return () => {
      cancelled = true;
    };
  }, [
    tenantId,
    formData.selected_customer_id,
    lot.customerId,
    actionName,
    isEditMode,
  ]);

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
          signal_amount: paidSignal > 0 ? formatCurrencyBRL(paidSignal) : '',
          signal_date: signalDate ? String(signalDate).split('T')[0] : '',
          signal_payment_method: signalMethod || '',
          signal_notes: signalNotes || '',
          reservation_signal_paid: paidSignal,
        };

        if (actionName === 'Vendido' && paidSignal > 0) {
          next.down_payment = formatCurrencyBRL(paidSignal);
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

  const discountValue = parseCurrencyBRLNumber(formData.discount_value);
  const paymentType = formData.payment_type || 'À vista';
  const paymentMode = resolveSalePaymentMode({
    payment_type: paymentType,
    installments_count: formData.installments_count,
    down_payment: formData.down_payment,
  });
  const downPaymentStr = formData.down_payment || '';
  const installmentsCountStr = formData.installments_count ?? '';
  const installmentsValidation = paymentMode.isInstallment
    ? validateInstallmentsCount(installmentsCountStr)
    : null;

  const finalValue = Math.max(0, price - discountValue);
  const downPayment = parseCurrencyBRLNumber(downPaymentStr);

  const selectedBroker = useMemo(
    () => brokers.find((b) => b.id === formData.broker_id) || null,
    [brokers, formData.broker_id],
  );

  const commissionPreview = useMemo(() => {
    if (!formData.broker_id || !selectedBroker) return null;
    const plan = resolveSaleCommissionPlan({
      broker: selectedBroker,
      useBrokerDefault: formData.use_broker_default_commission,
      saleCommissionMode: formData.sale_commission_mode,
      saleCommissionPercent: formData.sale_commission_percent,
      saleCommissionFixedAmount: parseCurrencyBRLNumber(
        formData.sale_commission_fixed_amount,
      ),
      saleValue: finalValue,
    });
    return {
      plan,
      ...formatBrokerCommissionPreview(plan),
      brokerName: selectedBroker.name,
    };
  }, [
    formData.broker_id,
    formData.use_broker_default_commission,
    formData.sale_commission_mode,
    formData.sale_commission_percent,
    formData.sale_commission_fixed_amount,
    selectedBroker,
    finalValue,
  ]);

  const applyBrokerDefaultCommission = (brokerId: string) => {
    const broker = brokers.find((b) => b.id === brokerId);
    if (!broker) {
      setField({
        broker_id: brokerId,
        sale_commission_mode: 'NONE',
        sale_commission_percent: 0,
        sale_commission_fixed_amount: '',
      });
      return;
    }
    const defaults = resolveBrokerDefaultCommissionPlan(broker);
    setField({
      broker_id: brokerId,
      sale_commission_mode: defaults.mode,
      sale_commission_percent: defaults.percent,
      sale_commission_fixed_amount:
        defaults.mode === 'FIXED'
          ? serializeCurrencyBRL(String(defaults.fixedAmount))
          : '',
    });
  };
  const installmentsCount =
    installmentsValidation?.valid === true ? installmentsValidation.value : 0;
  const isRecantoSinal = !downPaymentReducesInstallmentBase(contractModel);
  const isStandardSaleForm = !isRecantoSinal;
  const signalContractValue = isRecantoSinal
    ? parseCurrencyBRLNumber(
        formData.signal_contract_value || downPaymentStr || '',
      )
    : downPayment;
  const signalPaidAtSale = isRecantoSinal
    ? parseCurrencyBRLNumber(formData.signal_paid_at_sale || '')
    : 0;
  const recantoSignalPlan = isRecantoSinal
    ? resolveRecantoSignalPlan({
        contractValue: signalContractValue,
        paidAtSale: signalPaidAtSale,
        paymentMode: formData.signal_remaining_payment_mode || 'FIRST_INSTALLMENTS',
        remainingInstallments: formData.signal_remaining_installments
          ? Number(formData.signal_remaining_installments)
          : null,
        totalInstallments: installmentsCount,
      })
    : null;
  const balloonPlan = resolveSaleBalloonPlan({
    useBalloon: Boolean(formData.use_balloon_installments),
    installmentsCount,
    contractValue: finalValue,
    config: formData.balloon_config ?? null,
  });
  const installmentPrincipal =
    installmentsCount > 0
      ? resolveInstallmentPrincipal({
          totalValue: finalValue,
          downPayment: isRecantoSinal ? signalContractValue : downPayment,
          contractModel,
        })
      : 0;
  const balloonComps =
    installmentsCount > 0
      ? applyBalloonToInstallmentAmounts(
          installmentPrincipal,
          installmentsCount,
          balloonPlan,
        )
      : [];
  const installmentValue =
    installmentsCount > 0
      ? balloonPlan.enabled && balloonPlan.items.length > 0
        ? balloonComps[0]?.baseAmount ?? 0
        : computeInstallmentDisplayValue({
            finalValue,
            downPayment: isRecantoSinal ? signalContractValue : downPayment,
            installmentsCount,
            contractModel,
          })
      : 0;
  const recantoInstallmentPreview =
    isRecantoSinal && installmentsCount > 0 && recantoSignalPlan
      ? applySignalAddonToInstallmentAmounts(
          balloonPlan.enabled && balloonPlan.items.length > 0
            ? balloonComps.map((c) => c.amount)
            : splitInstallmentAmounts(installmentPrincipal, installmentsCount),
          recantoSignalPlan,
        )
      : null;
  const installmentValueFmt = formatCurrencyBRL(installmentValue);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let confirmedInstallmentsCount = installmentsCountStr;
    let confirmedInstallmentValue = installmentValue;

    const emailCheck = validateOptionalCustomerEmail(formData.email);
    if (!emailCheck.valid) {
      alert(emailCheck.message);
      return;
    }

    if (actionName === 'Reservado') {
      if (!formData.name?.trim()) {
        alert('Preencha o campo obrigatório: Nome completo.');
        return;
      }
    }

    if (actionName === 'Vendido' || isEditMode) {
      if (paymentMode.isImmediateCash || paymentMode.isSingleFuture) {
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
        if (discountValue > price) {
          alert('O desconto não pode ser maior que o valor do lote.');
          return;
        }
        if (finalValue <= 0) {
          alert('O valor final não pode ser zero ou negativo.');
          return;
        }
        const effectiveDownPayment = isRecantoSinal
          ? signalContractValue
          : downPayment;
        if (effectiveDownPayment > price) {
          alert(
            isRecantoSinal
              ? 'O sinal não pode ser maior que o valor do lote.'
              : 'A entrada não pode ser maior que o valor do lote.',
          );
          return;
        }
        const installmentsResult = validateInstallmentsCount(formData.installments_count);
        if (!installmentsResult.valid) {
          alert(installmentsResult.message);
          return;
        }
        confirmedInstallmentsCount = String(installmentsResult.value);
        confirmedInstallmentValue = computeInstallmentDisplayValue({
          finalValue,
          downPayment: effectiveDownPayment,
          installmentsCount: installmentsResult.value,
          contractModel,
        });

        if (isRecantoSinal) {
          const signalValidation = validateRecantoSignalPlan({
            contractValue: signalContractValue,
            paidAtSale: signalPaidAtSale,
            paymentMode: formData.signal_remaining_payment_mode || 'FIRST_INSTALLMENTS',
            remainingInstallments: formData.signal_remaining_installments
              ? Number(formData.signal_remaining_installments)
              : null,
            totalInstallments: installmentsResult.value,
          });
          if (!signalValidation.valid) {
            alert(signalValidation.message);
            return;
          }
          if (
            (signalContractValue > 0 || signalPaidAtSale > 0) &&
            !formData.down_payment_due_date
          ) {
            alert('Por favor, preencha a data de vencimento do sinal.');
            return;
          }
        } else if (downPayment > 0 && !formData.down_payment_due_date) {
          alert('Por favor, preencha a data de vencimento da entrada.');
          return;
        }
        if (!formData.first_installment_due_date) {
          alert('Por favor, preencha a data de vencimento da primeira parcela.');
          return;
        }

        if (formData.use_balloon_installments && !formData.balloon_locked) {
          const balloonValidation = validateSaleBalloonConfiguration({
            plan: resolveSaleBalloonPlan({
              useBalloon: true,
              installmentsCount: installmentsResult.value,
              contractValue: finalValue,
              config: formData.balloon_config ?? null,
            }),
            paymentType: paymentType,
            installmentsCount: installmentsResult.value,
            principal: resolveInstallmentPrincipal({
              totalValue: finalValue,
              downPayment: effectiveDownPayment,
              contractModel,
            }),
            finalValue,
            entryAmount: isRecantoSinal ? 0 : downPayment,
            firstInstallmentDueDate: formData.first_installment_due_date,
            entryReducesPrincipal: !isRecantoSinal,
          });
          if (!balloonValidation.valid) {
            alert(balloonValidation.message);
            return;
          }
        }
      }
    }

    if (actionName === 'Vendido' || isEditMode) {
      const saleValidation = validateSaleLotFormSubmission({
        form: formData,
        finalValue,
      });
      if (!saleValidation.valid) {
        alert(saleValidation.message || 'Preencha os campos obrigatórios.');
        if (saleValidation.contractValidation) {
          onCustomerValidationFailed?.(saleValidation.contractValidation);
        }
        return;
      }
    }

    setSubmitting(true);
    try {
      const recantoDownPayment = isRecantoSinal
        ? serializeCurrencyBRL(String(signalContractValue || 0))
        : serializeCurrencyBRL(downPaymentStr);
      await onConfirm({
        ...formData,
        payment_type: paymentType,
        discount_value: serializeCurrencyBRL(formData.discount_value),
        down_payment: recantoDownPayment,
        signal_contract_value: isRecantoSinal
          ? serializeCurrencyBRL(String(signalContractValue || 0))
          : '',
        signal_paid_at_sale: isRecantoSinal
          ? serializeCurrencyBRL(String(signalPaidAtSale || 0))
          : '',
        signal_remaining_payment_mode: isRecantoSinal
          ? formData.signal_remaining_payment_mode || 'FIRST_INSTALLMENTS'
          : '',
        signal_remaining_installments: isRecantoSinal
          ? formData.signal_remaining_installments || ''
          : '',
        installments_count: paymentMode.isInstallment
          ? confirmedInstallmentsCount
          : '1',
        lot_value: price,
        final_value: finalValue,
        installment_value: paymentMode.isInstallment
          ? confirmedInstallmentValue
          : finalValue,
        use_balloon_installments:
          paymentMode.isInstallment && Boolean(formData.use_balloon_installments),
        balloon_config:
          paymentMode.isInstallment && formData.use_balloon_installments
            ? formData.balloon_config || emptyBalloonFormConfig()
            : null,
        installment_correction_type: isStandardSaleForm
          ? paymentMode.isInstallment
            ? normalizeInstallmentCorrectionType(formData.installment_correction_type)
            : DEFAULT_INSTALLMENT_CORRECTION_TYPE
          : DEFAULT_INSTALLMENT_CORRECTION_TYPE,
        sale_commission_fixed_amount: String(
          parseCurrencyBRLNumber(formData.sale_commission_fixed_amount) || 0,
        ),
      });
    } catch (err) {
      console.error('CUSTOMER_LOT_FORM_SUBMIT_ERROR', err);
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a operação.';
      alert(msg);
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (patch: Partial<LotFormState>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const setSpouseField = (patch: Partial<SaleSpouseFormFields>) => {
    setFormData((prev) => ({
      ...prev,
      ...patch,
      update_spouse_registry: true,
    }));
    setSpouseReuseFromPrior(false);
  };

  const handleSpouseCpfChange = (raw: string) => {
    setSpouseField({ sale_spouse_cpf: formatSpouseCpf(raw) });
  };

  const spouseCpfValidation = getSpouseCpfValidationState(formData.sale_spouse_cpf);

  const applySpouseSuggestion = (suggestion: CustomerSpouseSuggestion) => {
    if (saleSpouseFormHasContent(formData)) {
      const ok = window.confirm(
        'Substituir os dados atuais pelos dados cadastrados anteriormente?',
      );
      if (!ok) return;
    }
    setFormData((prev) => ({
      ...prev,
      ...applySpouseSuggestionToForm(suggestion),
      update_spouse_registry: false,
    }));
    setSpouseReuseFromPrior(true);
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
    <div className="sv-modal-overlay z-[1000] pointer-events-auto font-sans">
      <div className="sv-modal-shell sv-modal-shell--full-mobile bg-white animate-in fade-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in duration-200">
        <div className="sv-modal-header sticky top-0 z-20 p-4 border-b border-gray-100 flex items-center justify-between bg-white shadow-sm">
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

        <div className="gis-commercial-modal sv-modal-body flex-1 p-5 pr-4 text-slate-900">
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

          <div className="mb-4 flex gap-1 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('dados')}
              className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                activeTab === 'dados'
                  ? 'border-emerald-700 text-emerald-800'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Dados
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('documentos')}
              className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                activeTab === 'documentos'
                  ? 'border-emerald-700 text-emerald-800'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Documentos da Venda
            </button>
          </div>

          {activeTab === 'documentos' ? (
            <SaleDocumentsPanel
              saleId={isEditMode ? saleId : null}
              disabled={submitting || prefillLoading}
            />
          ) : (
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">CPF / CNPJ *</label>
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">RG *</label>
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Profissão *</label>
                  <input
                    type="text"
                    value={formData.profession}
                    onChange={(e) => setField({ profession: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Estado Civil *</label>
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">Endereço *</label>
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
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Cidade *</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setField({ city: e.target.value })}
                    className={GIS_INPUT}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">UF *</label>
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

            {(actionName === 'Vendido' || isEditMode) && (
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.has_spouse}
                    onChange={(e) => {
                      if (!e.target.checked) {
                        setFormData((prev) => ({
                          ...prev,
                          ...emptySaleSpouseFormFields(),
                        }));
                      } else {
                        setField({ has_spouse: true, update_spouse_registry: true });
                      }
                    }}
                    disabled={submitting || prefillLoading}
                    className="rounded border-gray-300"
                  />
                  Possui Cônjuge
                </label>

                {formData.has_spouse && (
                  <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between gap-2 border-b pb-1">
                      <h4 className="text-sm font-bold text-gray-900">
                        DADOS DO CÔNJUGE
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData((prev) => ({
                            ...prev,
                            ...clearSpouseFormFields(),
                            has_spouse: true,
                            update_spouse_registry: false,
                          }));
                          setSpouseReuseFromPrior(false);
                        }}
                        disabled={submitting || prefillLoading}
                        className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline"
                      >
                        Limpar dados
                      </button>
                    </div>

                    {spouseSuggestionsLoading ? (
                      <p className="text-xs text-slate-500 flex items-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Buscando cônjuge já cadastrado...
                      </p>
                    ) : null}

                    {!spouseSuggestionsLoading && spouseSuggestions.length > 0 ? (
                      <div className="rounded-lg border border-teal-200 bg-teal-50/80 p-3 space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800">
                          Cônjuge já cadastrado
                        </p>
                        {spouseSuggestions.slice(0, 4).map((suggestion) => (
                          <div
                            key={suggestion.key}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm text-slate-800"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{suggestion.name}</div>
                              <div className="text-xs text-slate-600 font-mono">
                                CPF: {suggestion.cpfMasked}
                                {suggestion.lastUsedLabel
                                  ? ` · Última utilização: ${suggestion.lastUsedLabel}`
                                  : ''}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => applySpouseSuggestion(suggestion)}
                              disabled={submitting || prefillLoading}
                              className="shrink-0 px-3 py-1.5 rounded-md text-xs font-bold bg-teal-600 text-white hover:bg-teal-500 disabled:opacity-50"
                            >
                              Usar estes dados
                            </button>
                          </div>
                        ))}
                        <p className="text-[10px] text-teal-900/70">
                          Não preenche automaticamente — confirme com o botão acima.
                          {isEditMode
                            ? ' Na edição, a venda mantém o snapshot próprio até você escolher reutilizar.'
                            : ''}
                        </p>
                      </div>
                    ) : null}

                    {spouseReuseFromPrior ? (
                      <p className="text-[11px] text-slate-500">
                        Dados carregados de cadastro anterior — você pode editar livremente.
                      </p>
                    ) : null}

                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Nome</label>
                      <input
                        type="text"
                        value={formData.sale_spouse_name}
                        onChange={(e) => setSpouseField({ sale_spouse_name: e.target.value })}
                        className={GIS_INPUT}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Nacionalidade</label>
                        <input
                          type="text"
                          value={formData.sale_spouse_nationality}
                          onChange={(e) => setSpouseField({ sale_spouse_nationality: e.target.value })}
                          className={GIS_INPUT}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Estado Civil</label>
                        <select
                          value={formData.sale_spouse_marital_status}
                          onChange={(e) => setSpouseField({ sale_spouse_marital_status: e.target.value })}
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
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Profissão</label>
                      <input
                        type="text"
                        value={formData.sale_spouse_profession}
                        onChange={(e) => setSpouseField({ sale_spouse_profession: e.target.value })}
                        className={GIS_INPUT}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">RG</label>
                        <input
                          type="text"
                          value={formData.sale_spouse_rg}
                          onChange={(e) => setSpouseField({ sale_spouse_rg: e.target.value })}
                          className={GIS_INPUT}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Órgão Emissor</label>
                        <input
                          type="text"
                          value={formData.sale_spouse_rg_issuer}
                          onChange={(e) => setSpouseField({ sale_spouse_rg_issuer: e.target.value })}
                          className={GIS_INPUT}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">CPF</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={formData.sale_spouse_cpf}
                          onChange={(e) => handleSpouseCpfChange(e.target.value)}
                          className={documentFieldInputClass(GIS_INPUT, spouseCpfValidation.tone)}
                          placeholder="000.000.000-00"
                        />
                        <DocumentFieldFeedback
                          message={spouseCpfValidation.message}
                          tone={spouseCpfValidation.tone}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Telefone</label>
                        <input
                          type="tel"
                          value={formData.sale_spouse_phone}
                          onChange={(e) => setSpouseField({ sale_spouse_phone: e.target.value })}
                          className={GIS_INPUT}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">E-mail</label>
                      <input
                        type="email"
                        value={formData.sale_spouse_email}
                        onChange={(e) => setSpouseField({ sale_spouse_email: e.target.value })}
                        className={GIS_INPUT}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Endereço</label>
                      <input
                        type="text"
                        value={formData.sale_spouse_address}
                        onChange={(e) => setSpouseField({ sale_spouse_address: e.target.value })}
                        className={GIS_INPUT}
                      />
                    </div>

                    <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 rounded border-gray-300"
                        checked={Boolean(formData.update_spouse_registry)}
                        onChange={(e) =>
                          setField({ update_spouse_registry: e.target.checked })
                        }
                        disabled={submitting || prefillLoading}
                      />
                      <span>
                        Atualizar cadastro do cônjuge para compras futuras
                        <span className="block text-[10px] text-slate-500 mt-0.5">
                          Não altera contratos ou vendas já geradas — só o cadastro reutilizável.
                        </span>
                      </span>
                    </label>
                  </div>
                )}
              </div>
            )}

            {actionName === 'Reservado' && (
              <div className="space-y-4 bg-amber-50 p-4 rounded-lg border border-amber-100">
                <h4 className="text-sm font-bold text-gray-900 border-b pb-1">SINAL DA RESERVA</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Valor do sinal (R$)</label>
                    <CurrencyInput
                      value={formData.signal_amount || ''}
                      onChange={(next) => setField({ signal_amount: next })}
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
                    Sinal da reserva: {formatCurrencyBRL(Number(formData.reservation_signal_paid) || 0)} — será
                    descontado da entrada na venda.
                  </p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Valor do Lote *</label>
                    <CurrencyInput
                      readOnly
                      value={String(price)}
                      onChange={() => {}}
                      className={`${GIS_INPUT_READONLY} font-medium`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Forma de Pagamento *</label>
                    <select
                      value={paymentType}
                      onChange={(e) => {
                        const nextType = e.target.value;
                        const nextMode = resolveSalePaymentMode({
                          payment_type: nextType,
                        });
                        setField({
                          payment_type: nextType,
                          installments_count: nextMode.isInstallment ? '' : '1',
                          first_installment_due_date: '',
                          use_balloon_installments: nextMode.isInstallment
                            ? formData.use_balloon_installments
                            : false,
                          balloon_config: nextMode.isInstallment
                            ? formData.balloon_config
                            : null,
                          installment_correction_type:
                            nextType === PAYMENT_TYPE_INSTALLMENT
                              ? formData.installment_correction_type ||
                                DEFAULT_INSTALLMENT_CORRECTION_TYPE
                              : DEFAULT_INSTALLMENT_CORRECTION_TYPE,
                        });
                      }}
                      className={GIS_INPUT}
                    >
                      {salePaymentModeSelectOptions().map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {isStandardSaleForm && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Valor do Desconto (R$)
                      </label>
                      <CurrencyInput
                        value={formData.discount_value}
                        onChange={(next) => setField({ discount_value: next })}
                        className={GIS_INPUT}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Valor Final *</label>
                      <CurrencyInput
                        readOnly
                        value={String(finalValue)}
                        onChange={() => {}}
                        className={`${GIS_INPUT_READONLY} font-bold text-green-700`}
                      />
                    </div>
                  </div>
                )}
                {paymentMode.isImmediateCash && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {!isStandardSaleForm ? (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Desconto (R$)</label>
                        <CurrencyInput
                          value={formData.discount_value}
                          onChange={(next) => setField({ discount_value: next })}
                          className={GIS_INPUT}
                        />
                      </div>
                    ) : null}
                    {!isStandardSaleForm ? (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Valor Final *</label>
                        <CurrencyInput
                          readOnly
                          value={String(finalValue)}
                          onChange={() => {}}
                          className={`${GIS_INPUT_READONLY} font-bold text-green-700`}
                        />
                      </div>
                    ) : null}
                    <div className={isStandardSaleForm ? 'md:col-span-3' : ''}>
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
                {paymentMode.isSingleFuture && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {!isStandardSaleForm ? (
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Desconto (R$)</label>
                          <CurrencyInput
                            value={formData.discount_value}
                            onChange={(next) => setField({ discount_value: next })}
                            className={GIS_INPUT}
                          />
                        </div>
                      ) : null}
                      {!isStandardSaleForm ? (
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Valor Final *</label>
                          <CurrencyInput
                            readOnly
                            value={String(finalValue)}
                            onChange={() => {}}
                            className={`${GIS_INPUT_READONLY} font-bold text-green-700`}
                          />
                        </div>
                      ) : null}
                      <div className={isStandardSaleForm ? 'md:col-span-3' : ''}>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Data de vencimento *
                        </label>
                        <input
                          type="date"
                          required
                          value={formData.down_payment_due_date}
                          onChange={(e) =>
                            setField({ down_payment_due_date: e.target.value })
                          }
                          className={GIS_INPUT_DATE}
                        />
                      </div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      <p className="font-semibold">Pagamento único com vencimento futuro</p>
                      <p className="mt-1">
                        Valor único: {formatCurrencyBRL(finalValue)}
                        {formData.down_payment_due_date
                          ? ` · Vencimento: ${formatContractDueDateBr(formData.down_payment_due_date)}`
                          : ' · Informe a data de vencimento'}
                      </p>
                      <p className="mt-1 text-[11px] text-amber-800">
                        A quitação ocorre somente após a confirmação do pagamento — não na assinatura.
                      </p>
                    </div>
                  </div>
                )}
                {paymentMode.isInstallment && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {isRecantoSinal ? (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Valor do sinal contratado (R$)
                          </label>
                          <CurrencyInput
                            value={formData.signal_contract_value || downPaymentStr}
                            onChange={(next) =>
                              setField({
                                signal_contract_value: next,
                                down_payment: next,
                              })
                            }
                            placeholder="3.500,00"
                            className={GIS_INPUT}
                          />
                          <p className="mt-1 text-[11px] text-gray-500 leading-snug">
                            Não abate o valor do lote nem o saldo parcelado.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Valor pago no ato do sinal (R$)
                          </label>
                          <CurrencyInput
                            value={formData.signal_paid_at_sale || ''}
                            onChange={(next) => setField({ signal_paid_at_sale: next })}
                            placeholder="800,00"
                            className={GIS_INPUT}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Restante do sinal
                          </label>
                          <CurrencyInput
                            readOnly
                            value={String(recantoSignalPlan?.remainingValue ?? 0)}
                            onChange={() => {}}
                            className={`${GIS_INPUT_READONLY} font-semibold text-amber-800`}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Venc. do sinal (pago no ato)
                          </label>
                          <input
                            type="date"
                            required={signalContractValue > 0 || signalPaidAtSale > 0}
                            value={formData.down_payment_due_date}
                            onChange={(e) =>
                              setField({ down_payment_due_date: e.target.value })
                            }
                            className={GIS_INPUT_DATE}
                          />
                        </div>
                        {(recantoSignalPlan?.remainingValue ?? 0) > 0 ? (
                          <>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Forma de cobrança do restante do sinal
                              </label>
                              <select
                                value={
                                  formData.signal_remaining_payment_mode ||
                                  'FIRST_INSTALLMENTS'
                                }
                                onChange={(e) =>
                                  setField({
                                    signal_remaining_payment_mode: e.target
                                      .value as SignalRemainingPaymentMode,
                                  })
                                }
                                className={GIS_INPUT}
                              >
                                <option value="FIRST_INSTALLMENTS">
                                  Acrescentar nas primeiras parcelas
                                </option>
                                <option value="ALL_INSTALLMENTS">
                                  Diluir em todas as parcelas
                                </option>
                              </select>
                            </div>
                            {(formData.signal_remaining_payment_mode ||
                              'FIRST_INSTALLMENTS') === 'FIRST_INSTALLMENTS' ? (
                              <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                  Qtd. de parcelas do restante do sinal
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={installmentsCount || undefined}
                                  value={formData.signal_remaining_installments || ''}
                                  onChange={(e) =>
                                    setField({
                                      signal_remaining_installments: e.target.value,
                                    })
                                  }
                                  placeholder="Ex: 15"
                                  className={GIS_INPUT}
                                />
                              </div>
                            ) : null}
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Acréscimo por parcela (sinal)
                              </label>
                              <CurrencyInput
                                readOnly
                                value={String(
                                  recantoSignalPlan?.remainingInstallmentValue ?? 0,
                                )}
                                onChange={() => {}}
                                className={`${GIS_INPUT_READONLY} font-semibold text-amber-800`}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="md:col-span-2">
                            <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                              Sinal pago integralmente no ato — nenhum acréscimo nas parcelas.
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Valor da Entrada (R$)
                          </label>
                          <CurrencyInput
                            value={downPaymentStr}
                            onChange={(next) => setField({ down_payment: next })}
                            className={GIS_INPUT}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Venc. Entrada
                          </label>
                          <input
                            type="date"
                            required={downPayment > 0}
                            value={formData.down_payment_due_date}
                            onChange={(e) =>
                              setField({ down_payment_due_date: e.target.value })
                            }
                            className={GIS_INPUT_DATE}
                          />
                        </div>
                      </>
                    )}
                    <InstallmentsCountCombobox
                      value={installmentsCountStr}
                      onChange={(nextValue) => setField({ installments_count: nextValue })}
                      disabled={submitting || prefillLoading}
                      inputClassName={GIS_INPUT}
                      required
                    />
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Valor da Parcela
                      </label>
                      <CurrencyInput
                        readOnly
                        value={installmentsCount > 0 ? String(installmentValue) : ''}
                        onChange={() => {}}
                        placeholder="—"
                        className={`${GIS_INPUT_READONLY} font-semibold text-blue-800`}
                      />
                      {isRecantoSinal &&
                      recantoInstallmentPreview &&
                      recantoSignalPlan?.hasRemaining ? (
                        <p className="mt-1 text-[11px] text-amber-800 leading-snug">
                          {recantoSignalPlan.paymentMode === 'ALL_INSTALLMENTS'
                            ? `Todas as parcelas: ${formatCurrencyBRL(
                                recantoInstallmentPreview[0]?.amount ?? installmentValue,
                              )} (base ${installmentValueFmt} + sinal ${formatCurrencyBRL(
                                recantoSignalPlan.remainingInstallmentValue,
                              )})`
                            : `Parcelas 1–${recantoSignalPlan.remainingInstallments}: ${formatCurrencyBRL(
                                recantoInstallmentPreview[0]?.amount ?? installmentValue,
                              )} · Demais: ${installmentValueFmt}`}
                        </p>
                      ) : null}
                    </div>
                    {isStandardSaleForm ? (
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                          Correção das Parcelas
                        </label>
                        <select
                          value={normalizeInstallmentCorrectionType(
                            formData.installment_correction_type,
                          )}
                          onChange={(e) =>
                            setField({ installment_correction_type: e.target.value })
                          }
                          className={GIS_INPUT}
                        >
                          {INSTALLMENT_CORRECTION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
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
                    <div className="md:col-span-2">
                      <SaleBalloonInstallmentsPanel
                        enabled={Boolean(formData.use_balloon_installments)}
                        locked={Boolean(formData.balloon_locked)}
                        installmentsCount={installmentsCount}
                        contractValue={finalValue}
                        entryAmount={isRecantoSinal ? 0 : downPayment}
                        principal={installmentPrincipal}
                        config={formData.balloon_config}
                        disabled={submitting || prefillLoading}
                        onEnabledChange={(next) =>
                          setField({
                            use_balloon_installments: next,
                            balloon_config:
                              formData.balloon_config || emptyBalloonFormConfig(),
                          })
                        }
                        onConfigChange={(nextConfig) =>
                          setField({ balloon_config: nextConfig })
                        }
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Conta recebedora / Conta financeira
                    </label>
                    <select
                      value={formData.financial_account_id}
                      onChange={(e) => setField({ financial_account_id: e.target.value })}
                      disabled={!canEditFinancialAccount || financialAccountsLoading || financialAccountsUnavailable}
                      className={canEditFinancialAccount ? GIS_INPUT : GIS_INPUT_READONLY}
                    >
                      <option value="">
                        {financialAccountsLoading
                          ? 'Carregando contas...'
                          : financialAccountsUnavailable
                            ? 'Módulo financeiro não disponível'
                            : financialAccounts.length === 0
                              ? 'Nenhuma conta financeira ativa cadastrada'
                              : 'Selecione a conta'}
                      </option>
                      {financialAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {formatFinancialAccountLabel(account)}
                          {account.isDefault ? ' · Padrão' : ''}
                        </option>
                      ))}
                    </select>
                    {!canEditFinancialAccount ? (
                      <p className="mt-1 text-[11px] text-gray-500">
                        Apenas administradores podem alterar a conta recebedora.
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Corretor</label>
                    <select
                      value={formData.broker_id}
                      onChange={(e) => {
                        const brokerId = e.target.value;
                        if (formData.use_broker_default_commission || !formData.broker_id) {
                          applyBrokerDefaultCommission(brokerId);
                        } else {
                          setField({ broker_id: brokerId });
                        }
                      }}
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
                  {formData.broker_id ? (
                    <div className="md:col-span-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <label className="flex items-center gap-2 text-sm text-gray-800">
                        <input
                          type="checkbox"
                          checked={formData.use_broker_default_commission}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            if (checked) {
                              applyBrokerDefaultCommission(formData.broker_id);
                              setField({ use_broker_default_commission: true });
                            } else {
                              setField({ use_broker_default_commission: false });
                            }
                          }}
                        />
                        Usar comissão padrão do corretor
                      </label>
                      {!formData.use_broker_default_commission ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                              Modelo desta venda
                            </label>
                            <select
                              value={formData.sale_commission_mode}
                              onChange={(e) =>
                                setField({
                                  sale_commission_mode: normalizeBrokerCommissionMode(
                                    e.target.value,
                                  ),
                                })
                              }
                              className={GIS_INPUT}
                            >
                              <option value="PERCENT">Percentual sobre a venda</option>
                              <option value="FIXED">Valor fixo por venda</option>
                              <option value="NONE">Sem comissão</option>
                            </select>
                          </div>
                          {formData.sale_commission_mode === 'PERCENT' ? (
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Percentual (%)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={formData.sale_commission_percent}
                                onChange={(e) =>
                                  setField({
                                    sale_commission_percent: Number(e.target.value) || 0,
                                  })
                                }
                                className={GIS_INPUT}
                              />
                            </div>
                          ) : null}
                          {formData.sale_commission_mode === 'FIXED' ? (
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Valor fixo
                              </label>
                              <CurrencyInput
                                value={formData.sale_commission_fixed_amount}
                                onChange={(v) =>
                                  setField({ sale_commission_fixed_amount: v })
                                }
                                className={GIS_INPUT}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {commissionPreview ? (
                        <div className="text-xs text-gray-700 space-y-0.5">
                          <p>
                            <span className="font-semibold">Corretor:</span>{' '}
                            {commissionPreview.brokerName}
                          </p>
                          <p>
                            <span className="font-semibold">Modelo:</span>{' '}
                            {commissionPreview.modelLabel}
                          </p>
                          <p>
                            <span className="font-semibold">Comissão desta venda:</span>{' '}
                            {commissionPreview.amountLabel}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
          )}
        </div>

        <div className="sv-modal-footer sticky bottom-0 z-20 p-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row gap-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-1/2 px-4 py-3 bg-gray-100 text-gray-700 font-semibold rounded-lg text-sm"
          >
            {activeTab === 'documentos' ? 'Fechar' : 'Cancelar'}
          </button>
          {activeTab === 'dados' ? (
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
          ) : (
            <button
              type="button"
              onClick={() => setActiveTab('dados')}
              className="w-full sm:w-1/2 px-4 py-3 bg-emerald-700 text-white font-semibold rounded-lg text-sm"
            >
              Voltar aos dados
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
