'use client';

import { AlertTriangle, Landmark, Plus, Scale, Trash2 } from 'lucide-react';
import { formatCurrencyBRL, parseCurrencyBRL } from '@/lib/currencyBrl';
import {
  formatAppliedRuleLabel,
  formatRetentionPercent,
} from '@/lib/contract-termination/formatSettlement';
import {
  IMPROVEMENTS_APPRAISAL_REQUIRED_MESSAGE,
  type ImprovementAppraisalStatus,
} from '@/lib/contract-termination/improvements';
import type {
  SettlementDestination,
  TerminationPolicy,
  TerminationPolicyOrigin,
  TerminationSettlement,
} from '@/lib/contract-termination/types';
import {
  formatIsoDateBr,
  resolveRefundSchedule,
  shouldDefineRefundSchedule,
  splitRefundInstallmentAmounts,
} from '@/lib/termination-documents/refundSchedule';

const FIELD_CLASS =
  'form-input-light w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500';

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return formatCurrencyBRL(Number(value)) || 'R$ 0,00';
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 break-words">{value}</p>
    </div>
  );
}

export type ImprovementDraftItem = {
  id: string;
  description: string;
  amount: string;
};

export type ReleaseLotSettlementSectionProps = {
  policy: TerminationPolicy;
  settlement: TerminationSettlement;
  origin?: TerminationPolicyOrigin | null;
  hasImprovements: 'sim' | 'nao';
  onHasImprovements: (value: 'sim' | 'nao') => void;
  improvementsAppraisalStatus: ImprovementAppraisalStatus;
  onImprovementsAppraisalStatus: (value: ImprovementAppraisalStatus) => void;
  improvementItems: ImprovementDraftItem[];
  onImprovementItems: (items: ImprovementDraftItem[]) => void;
  destination: SettlementDestination;
  onDestination: (value: SettlementDestination) => void;
  exceptionEnabled: boolean;
  onExceptionEnabled: (value: boolean) => void;
  exceptionMode: 'amount' | 'percent';
  onExceptionMode: (value: 'amount' | 'percent') => void;
  exceptionValue: string;
  onExceptionValue: (value: string) => void;
  exceptionJustification: string;
  onExceptionJustification: (value: string) => void;
  allowException?: boolean;
  refundFirstDueDate?: string;
  onRefundFirstDueDate?: (value: string) => void;
};

export function ReleaseLotSettlementSection({
  policy,
  settlement,
  origin,
  hasImprovements,
  onHasImprovements,
  improvementsAppraisalStatus,
  onImprovementsAppraisalStatus,
  improvementItems,
  onImprovementItems,
  destination,
  onDestination,
  exceptionEnabled,
  onExceptionEnabled,
  exceptionMode,
  onExceptionMode,
  exceptionValue,
  onExceptionValue,
  exceptionJustification,
  onExceptionJustification,
  allowException = false,
  refundFirstDueDate = '',
  onRefundFirstDueDate,
}: ReleaseLotSettlementSectionProps) {
  const incomplete =
    settlement.calculationStatus === 'INCOMPLETE' ||
    settlement.calculationStatus === 'MISSING_POLICY';
  const waiting =
    hasImprovements === 'sim' && improvementsAppraisalStatus !== 'COMPLETED';
  const improvementsTotal = improvementItems.reduce((acc, item) => {
    const n = parseCurrencyBRL(item.amount);
    return acc + (n != null ? n : 0);
  }, 0);
  const appraisalCompleted =
    hasImprovements === 'sim' && improvementsAppraisalStatus === 'COMPLETED';
  const contractualRefund =
    settlement.agreedRefundAmount != null
      ? Number(settlement.agreedRefundAmount)
      : Number(settlement.contractualRefundAmount || 0);
  const obligationTotal = appraisalCompleted
    ? contractualRefund + improvementsTotal
    : contractualRefund;
  const appliedRule = formatAppliedRuleLabel(policy, settlement);
  const retentionLabel = formatRetentionPercent(settlement.contractualRetentionPercent);
  const showCashRefundSchedule = shouldDefineRefundSchedule({
    destination,
    agreedRefundAmount: settlement.agreedRefundAmount,
    contractualRefundAmount: settlement.contractualRefundAmount,
    installmentCount: settlement.refundInstallmentCount,
    calculationStatus: settlement.calculationStatus,
    improvementsTotal: appraisalCompleted ? improvementsTotal : 0,
    scheduleTotal: appraisalCompleted ? obligationTotal : undefined,
  });
  const restitutionTotal = showCashRefundSchedule
    ? obligationTotal
    : contractualRefund;
  const installmentCount = Math.max(
    0,
    Math.floor(Number(settlement.refundInstallmentCount) || 0),
  );
  const installmentAmounts = showCashRefundSchedule
    ? splitRefundInstallmentAmounts(restitutionTotal, installmentCount)
    : [];
  const previewSchedule = showCashRefundSchedule
    ? resolveRefundSchedule({
        destination,
        agreedRefundAmount: settlement.agreedRefundAmount,
        contractualRefundAmount: settlement.contractualRefundAmount,
        installmentCount: settlement.refundInstallmentCount,
        calculationStatus: settlement.calculationStatus,
        firstDueDate: refundFirstDueDate,
        improvementsTotal: appraisalCompleted ? improvementsTotal : 0,
        scheduleTotal: appraisalCompleted ? obligationTotal : undefined,
      })
    : null;
  const lastDiffers =
    installmentAmounts.length > 1 &&
    installmentAmounts[0] !== installmentAmounts[installmentAmounts.length - 1];

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">Acerto financeiro</p>
        <p className="mt-1 text-xs text-slate-500">
          Prévia calculada no navegador. O servidor recalcula e persiste o acerto na
          venda original. Nenhuma restituição será paga nesta etapa.
        </p>
      </div>

      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-indigo-700 font-semibold">
            Regra aplicada conforme contrato
          </p>
          {origin?.badge ? (
            <span className="shrink-0 rounded-full border border-indigo-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-wide text-indigo-800">
              {origin.badge}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm font-semibold text-indigo-950">
          {origin?.title || 'Regra contratual'}
        </p>
        <p className="mt-0.5 text-sm text-indigo-950">
          {origin?.modelLine || policy.catalogLabel}
        </p>
        <p className="text-xs text-indigo-900">
          {origin?.clauseLine || settlement.clauseReference || '—'}
        </p>
        <p className="mt-2 text-sm text-indigo-950 leading-snug">{appliedRule}</p>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-800 mb-2">Há benfeitorias no imóvel?</p>
        <div className="flex flex-wrap gap-2">
          {(['nao', 'sim'] as const).map((value) => {
            const selected = hasImprovements === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onHasImprovements(value)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${
                  selected
                    ? 'border-orange-500 bg-orange-50 text-orange-900 ring-1 ring-orange-400'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300'
                }`}
              >
                {value === 'nao' ? 'Não' : 'Sim'}
              </button>
            );
          })}
        </div>
      </div>

      {hasImprovements === 'sim' ? (
        <div className="rounded-lg border border-orange-200 bg-white p-3 space-y-3">
          <p className="text-sm font-semibold text-slate-800">Benfeitorias do imóvel</p>
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1.5">Status da avaliação</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['PENDING', 'Aguardando avaliação'],
                  ['COMPLETED', 'Avaliação concluída'],
                ] as const
              ).map(([value, label]) => {
                const selected = improvementsAppraisalStatus === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onImprovementsAppraisalStatus(value)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${
                      selected
                        ? 'border-orange-500 bg-orange-50 text-orange-900 ring-1 ring-orange-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          {waiting ? (
            <div className="bg-amber-50 border border-amber-200 text-amber-950 rounded-lg p-3 text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Aguardando avaliação de benfeitorias</p>
                <p className="mt-1">{IMPROVEMENTS_APPRAISAL_REQUIRED_MESSAGE}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {improvementItems.map((item, index) => (
                <div
                  key={item.id}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-2 items-end rounded-lg border border-slate-200 bg-slate-50 p-2"
                >
                  <div>
                    <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                      Descrição da benfeitoria
                    </label>
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => {
                        const next = improvementItems.map((row) =>
                          row.id === item.id ? { ...row, description: e.target.value } : row,
                        );
                        onImprovementItems(next);
                      }}
                      className={FIELD_CLASS}
                      placeholder="Ex.: Muro de alvenaria"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                      Valor avaliado / reconhecido
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.amount}
                      onChange={(e) => {
                        const next = improvementItems.map((row) =>
                          row.id === item.id ? { ...row, amount: e.target.value } : row,
                        );
                        onImprovementItems(next);
                      }}
                      className={FIELD_CLASS}
                      placeholder="R$ 0,00"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = improvementItems.filter((row) => row.id !== item.id);
                      onImprovementItems(
                        next.length > 0
                          ? next
                          : [{ id: item.id, description: '', amount: '' }],
                      );
                    }}
                    className="mb-0.5 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-red-300 hover:text-red-700"
                    aria-label={`Excluir benfeitoria ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  onImprovementItems([
                    ...improvementItems,
                    {
                      id: `imp-${Date.now()}-${improvementItems.length + 1}`,
                      description: '',
                      amount: '',
                    },
                  ])
                }
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-orange-800 hover:text-orange-950"
              >
                <Plus className="w-4 h-4" />
                Adicionar benfeitoria
              </button>
              <p className="text-sm font-semibold text-slate-800">
                Total das benfeitorias: {money(improvementsTotal)}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {incomplete ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-950 rounded-lg p-3 text-sm">
          {settlement.warnings[0] ||
            'Este contrato não possui política de restituição homologada para cálculo automático.'}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Line label="Total pago" value={money(settlement.totalPaid)} />
        <Line
          label="Entrada / sinal"
          value={`${money(settlement.entryPaid)} / ${money(settlement.signalPaid)}`}
        />
        <Line label="Valor não reembolsável" value={incomplete ? '—' : money(settlement.nonRefundableAmount)} />
        <Line label="Base da restituição" value={incomplete ? '—' : money(settlement.refundableBase)} />
        <Line label="Retenção contratual" value={incomplete ? '—' : retentionLabel} />
        <Line
          label="Valor da retenção"
          value={incomplete ? '—' : money(settlement.contractualRetentionAmount)}
        />
        <Line
          label={waiting ? 'Valor líquido previsto (provisório)' : 'Valor líquido previsto'}
          value={incomplete ? '—' : money(settlement.contractualRefundAmount)}
        />
        <Line
          label="Quantidade prevista de parcelas"
          value={
            incomplete || settlement.refundInstallmentCount == null
              ? '—'
              : String(settlement.refundInstallmentCount)
          }
        />
      </div>

      {policy.creditOtherUnitAllowed ? (
        <div>
          <p className="text-sm font-semibold text-slate-800 mb-2">Destino do valor</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onDestination('REFUND_CUSTOMER')}
              className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${
                destination === 'REFUND_CUSTOMER'
                  ? 'border-orange-500 bg-orange-50 text-orange-900 ring-1 ring-orange-400'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300'
              }`}
            >
              Restituir ao cliente
            </button>
            <button
              type="button"
              onClick={() => onDestination('CREDIT_OTHER_UNIT')}
              className={`px-3 py-1.5 rounded-lg border text-sm font-semibold ${
                destination === 'CREDIT_OTHER_UNIT'
                  ? 'border-orange-500 bg-orange-50 text-orange-900 ring-1 ring-orange-400'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-orange-300'
              }`}
            >
              Creditar em outra unidade
            </button>
          </div>
          {destination === 'CREDIT_OTHER_UNIT' ? (
            <p className="mt-2 text-xs text-slate-600">
              Simulação — nenhuma transferência financeira será realizada nesta etapa.
              {appraisalCompleted
                ? ' Benfeitorias reconhecidas não são convertidas em crédito de outra unidade.'
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {showCashRefundSchedule ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                Valor de cada parcela
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {money(installmentAmounts[0])}
              </p>
              {lastDiffers ? (
                <p className="mt-0.5 text-xs text-slate-500">
                  Última parcela {money(installmentAmounts[installmentAmounts.length - 1])} para
                  fechar o total
                </p>
              ) : null}
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                Vencimento da 1ª parcela <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={refundFirstDueDate}
                onChange={(e) => onRefundFirstDueDate?.(e.target.value)}
                className={FIELD_CLASS}
                required
              />
            </div>
          </div>
          {previewSchedule?.ok && previewSchedule.schedule.defined ? (
            <p className="text-xs text-slate-600">
              {previewSchedule.schedule.installmentCount} parcela
              {previewSchedule.schedule.installmentCount === 1 ? '' : 's'} mensais de{' '}
              {money(previewSchedule.schedule.installments[0]?.amount)}
              {lastDiffers
                ? ` (última ${money(
                    previewSchedule.schedule.installments[
                      previewSchedule.schedule.installments.length - 1
                    ]?.amount,
                  )})`
                : ''}{' '}
              — primeira em {formatIsoDateBr(previewSchedule.schedule.firstDueDate)}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              As parcelas seguintes avançam um mês civil a partir desta data. Nenhuma data é
              inventada automaticamente.
            </p>
          )}
        </div>
      ) : null}

      {allowException ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
          <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={exceptionEnabled}
              onChange={(e) => onExceptionEnabled(e.target.checked)}
              className="mt-1"
            />
            <span>
              Ativar condição excepcional (acordo fora da regra contratual). Somente no
              distrato. O valor contratual permanece preservado.
            </span>
          </label>
          {exceptionEnabled ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1">Tipo do acordo</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onExceptionMode('amount')}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                      exceptionMode === 'amount'
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    Valor acordado
                  </button>
                  <button
                    type="button"
                    onClick={() => onExceptionMode('percent')}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                      exceptionMode === 'percent'
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    Percentual de retenção
                  </button>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={exceptionValue}
                  onChange={(e) => onExceptionValue(e.target.value)}
                  className={`${FIELD_CLASS} mt-2`}
                  placeholder={exceptionMode === 'amount' ? 'Valor em reais' : 'Percentual'}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Justificativa <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={exceptionJustification}
                  onChange={(e) => onExceptionJustification(e.target.value)}
                  className={FIELD_CLASS}
                  rows={3}
                  placeholder="Obrigatória para aplicar o valor acordado"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              Contratual
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {incomplete ? '—' : money(settlement.contractualRefundAmount)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Retenção {incomplete ? '—' : retentionLabel}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" />
              Acordado
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {incomplete || waiting ? '—' : money(settlement.agreedRefundAmount)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {settlement.exceptionApplied
                ? 'Valor excepcional informado pelo operador'
                : 'Igual ao contratual até haver acordo justificado'}
            </p>
          </div>
        </div>
        {appraisalCompleted ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Line label="Benfeitorias reconhecidas" value={money(improvementsTotal)} />
            <Line label="Restituição contratual" value={incomplete || waiting ? '—' : money(contractualRefund)} />
            <Line
              label="Total da obrigação com o cliente"
              value={incomplete || waiting ? '—' : money(obligationTotal)}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
