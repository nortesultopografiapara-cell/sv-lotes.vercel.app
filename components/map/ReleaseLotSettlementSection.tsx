'use client';

import { AlertTriangle, Landmark, Scale } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  formatAppliedRuleLabel,
  formatRetentionPercent,
} from '@/lib/contract-termination/formatSettlement';
import type {
  SettlementDestination,
  TerminationPolicy,
  TerminationPolicyOrigin,
  TerminationSettlement,
} from '@/lib/contract-termination/types';

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

export type ReleaseLotSettlementSectionProps = {
  policy: TerminationPolicy;
  settlement: TerminationSettlement;
  origin?: TerminationPolicyOrigin | null;
  hasImprovements: 'sim' | 'nao';
  onHasImprovements: (value: 'sim' | 'nao') => void;
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
};

export function ReleaseLotSettlementSection({
  policy,
  settlement,
  origin,
  hasImprovements,
  onHasImprovements,
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
}: ReleaseLotSettlementSectionProps) {
  const incomplete =
    settlement.calculationStatus === 'INCOMPLETE' ||
    settlement.calculationStatus === 'MISSING_POLICY';
  const waiting = settlement.calculationStatus === 'WAITING_IMPROVEMENT_APPRAISAL';
  const appliedRule = formatAppliedRuleLabel(policy, settlement);
  const retentionLabel = formatRetentionPercent(settlement.contractualRetentionPercent);

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">Acerto financeiro</p>
        <p className="mt-1 text-xs text-slate-500">
          Simulação somente leitura. Nenhuma restituição, retenção ou transferência será
          registrada nesta etapa.
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

      {waiting ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-950 rounded-lg p-3 text-xs flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Aguardando avaliação de benfeitorias</p>
            <p className="mt-1">
              O contrato exige avaliação técnica das benfeitorias. Os valores abaixo são
              provisórios e não constituem acerto definitivo.
            </p>
          </div>
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
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={exceptionEnabled}
            onChange={(e) => onExceptionEnabled(e.target.checked)}
            className="mt-1"
          />
          <span>
            Ativar condição excepcional (acordo fora da regra contratual). Não substitui o
            cálculo contratual e não será persistida nesta fase.
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
      </div>
    </section>
  );
}
