'use client';

import { CurrencyInput } from '@/components/ui/CurrencyInput';
import {
  BALLOON_EDIT_LOCKED_MESSAGE,
  buildBalloonFinancePreview,
  emptyBalloonFormConfig,
  resolveSaleBalloonPlan,
  type SaleBalloonFormConfig,
  type SaleBalloonMode,
} from '@/lib/saleBalloonInstallments';
import { formatCurrencyBRL } from '@/lib/currencyBrl';

const GIS_INPUT =
  'form-input-light w-full px-3 py-2 rounded-lg text-sm disabled:cursor-not-allowed';
const GIS_INPUT_DATE =
  'form-input-light w-full px-3 py-2 rounded-lg text-sm [color-scheme:light] disabled:cursor-not-allowed';

type Props = {
  enabled: boolean;
  locked?: boolean;
  installmentsCount: number;
  /** Valor final da venda (já com desconto). */
  contractValue: number;
  /** Entrada (PADRAO) — 0 no Recanto para o fechamento visual. */
  entryAmount?: number;
  /** Saldo parcelável (principal após entrada) — base do split. */
  principal: number;
  config: SaleBalloonFormConfig | null | undefined;
  disabled?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onConfigChange: (config: SaleBalloonFormConfig) => void;
};

const INTERVAL_OPTIONS: Array<6 | 12 | 18 | 24> = [6, 12, 18, 24];

export function SaleBalloonInstallmentsPanel({
  enabled,
  locked = false,
  installmentsCount,
  contractValue,
  entryAmount = 0,
  principal,
  config,
  disabled,
  onEnabledChange,
  onConfigChange,
}: Props) {
  const cfg = config || emptyBalloonFormConfig();
  const isDisabled = disabled || locked;

  const setMode = (mode: SaleBalloonMode) => {
    onConfigChange({ ...cfg, mode });
  };

  const plan = resolveSaleBalloonPlan({
    useBalloon: enabled,
    installmentsCount,
    contractValue,
    config: cfg,
  });
  const financePreview =
    enabled && installmentsCount > 0 && plan.items.length > 0
      ? buildBalloonFinancePreview({
          finalValue: contractValue,
          entryAmount,
          principal,
          installmentsCount,
          plan,
        })
      : null;

  const manualRows =
    cfg.manualRows && cfg.manualRows.length > 0
      ? cfg.manualRows
      : [{ installmentNumber: '', additionalAmount: '', dueDate: '' }];

  return (
    <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={enabled}
          disabled={isDisabled}
          onChange={(e) => {
            const next = e.target.checked;
            onEnabledChange(next);
            if (next && !config) {
              onConfigChange(emptyBalloonFormConfig());
            }
          }}
        />
        <span className="text-sm font-semibold text-gray-800">
          Utilizar parcelas balão
        </span>
      </label>

      {locked ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          {BALLOON_EDIT_LOCKED_MESSAGE}
        </p>
      ) : null}

      {enabled ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-3">
          <div className="flex flex-wrap gap-3 text-xs font-medium text-gray-700">
            {(
              [
                ['MANUAL', 'Balão manual'],
                ['FINAL', 'Balão final'],
                ['RECURRENT', 'Balão recorrente'],
              ] as const
            ).map(([mode, label]) => (
              <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="balloon-mode"
                  checked={cfg.mode === mode}
                  disabled={isDisabled}
                  onChange={() => setMode(mode)}
                />
                {label}
              </label>
            ))}
          </div>

          {cfg.mode === 'MANUAL' ? (
            <div className="space-y-2">
              <div className="max-w-[160px]">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Quantidade de parcelas balão
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, installmentsCount || 1)}
                  disabled={isDisabled}
                  value={cfg.manualCount ?? manualRows.length}
                  onChange={(e) => {
                    const count = Math.max(1, Math.min(40, Number(e.target.value) || 1));
                    const nextRows = [...manualRows];
                    while (nextRows.length < count) {
                      nextRows.push({
                        installmentNumber: '',
                        additionalAmount: '',
                        dueDate: '',
                      });
                    }
                    onConfigChange({
                      ...cfg,
                      manualCount: count,
                      manualRows: nextRows.slice(0, count),
                    });
                  }}
                  className={GIS_INPUT}
                />
              </div>
              {manualRows.map((row, index) => (
                <div
                  key={`balloon-row-${index}`}
                  className="grid grid-cols-1 md:grid-cols-3 gap-2"
                >
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Parcela
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={installmentsCount || undefined}
                      disabled={isDisabled}
                      value={row.installmentNumber}
                      onChange={(e) => {
                        const next = [...manualRows];
                        next[index] = {
                          ...next[index],
                          installmentNumber: e.target.value,
                        };
                        onConfigChange({ ...cfg, manualRows: next });
                      }}
                      placeholder="Ex: 12"
                      className={GIS_INPUT}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Valor adicional
                    </label>
                    <CurrencyInput
                      disabled={isDisabled}
                      value={row.additionalAmount}
                      onChange={(nextVal) => {
                        const next = [...manualRows];
                        next[index] = {
                          ...next[index],
                          additionalAmount: nextVal,
                        };
                        onConfigChange({ ...cfg, manualRows: next });
                      }}
                      className={GIS_INPUT}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Vencimento (opcional)
                    </label>
                    <input
                      type="date"
                      disabled={isDisabled}
                      value={row.dueDate || ''}
                      onChange={(e) => {
                        const next = [...manualRows];
                        next[index] = { ...next[index], dueDate: e.target.value };
                        onConfigChange({ ...cfg, manualRows: next });
                      }}
                      className={GIS_INPUT_DATE}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {cfg.mode === 'FINAL' ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-800">
                <input
                  type="checkbox"
                  checked={Boolean(cfg.finalUseLast)}
                  disabled={isDisabled}
                  onChange={(e) =>
                    onConfigChange({ ...cfg, finalUseLast: e.target.checked })
                  }
                />
                Última parcela será balão
              </label>
              {cfg.finalUseLast ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Tipo do valor
                    </label>
                    <select
                      disabled={isDisabled}
                      value={cfg.finalAmountMode || 'VALUE'}
                      onChange={(e) =>
                        onConfigChange({
                          ...cfg,
                          finalAmountMode: e.target.value as 'VALUE' | 'PERCENT',
                        })
                      }
                      className={GIS_INPUT}
                    >
                      <option value="VALUE">Valor do balão (R$)</option>
                      <option value="PERCENT">Percentual do contrato (%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {(cfg.finalAmountMode || 'VALUE') === 'PERCENT'
                        ? 'Percentual'
                        : 'Valor do balão'}
                    </label>
                    {(cfg.finalAmountMode || 'VALUE') === 'PERCENT' ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        disabled={isDisabled}
                        value={cfg.finalPercent || ''}
                        onChange={(e) =>
                          onConfigChange({ ...cfg, finalPercent: e.target.value })
                        }
                        className={GIS_INPUT}
                        placeholder="Ex: 20"
                      />
                    ) : (
                      <CurrencyInput
                        disabled={isDisabled}
                        value={cfg.finalValue || ''}
                        onChange={(nextVal) =>
                          onConfigChange({ ...cfg, finalValue: nextVal })
                        }
                        className={GIS_INPUT}
                      />
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {cfg.mode === 'RECURRENT' ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-800">
                <input
                  type="checkbox"
                  checked={Boolean(cfg.recurrentEnabled)}
                  disabled={isDisabled}
                  onChange={(e) =>
                    onConfigChange({ ...cfg, recurrentEnabled: e.target.checked })
                  }
                />
                Gerar balão recorrente
              </label>
              {cfg.recurrentEnabled ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Intervalo
                    </label>
                    <select
                      disabled={isDisabled}
                      value={cfg.recurrentIntervalMonths || 12}
                      onChange={(e) =>
                        onConfigChange({
                          ...cfg,
                          recurrentIntervalMonths: Number(
                            e.target.value,
                          ) as 6 | 12 | 18 | 24,
                        })
                      }
                      className={GIS_INPUT}
                    >
                      {INTERVAL_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n} meses
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Quantidade de balões
                    </label>
                    <input
                      type="number"
                      min={1}
                      disabled={isDisabled}
                      value={cfg.recurrentQuantity || ''}
                      onChange={(e) =>
                        onConfigChange({
                          ...cfg,
                          recurrentQuantity: e.target.value,
                        })
                      }
                      className={GIS_INPUT}
                      placeholder="Ex: 5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Valor de cada balão
                    </label>
                    <CurrencyInput
                      disabled={isDisabled}
                      value={cfg.recurrentValue || ''}
                      onChange={(nextVal) =>
                        onConfigChange({ ...cfg, recurrentValue: nextVal })
                      }
                      className={GIS_INPUT}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {financePreview ? (
            <div className="text-[11px] text-slate-800 bg-white border border-slate-200 rounded px-3 py-2 space-y-1.5">
              <p className="font-semibold text-slate-900">Resumo financeiro</p>
              <p>Valor da venda: {formatCurrencyBRL(financePreview.saleTotal)}</p>
              <p>Entrada: {formatCurrencyBRL(financePreview.entryAmount)}</p>
              <p>Total dos balões: {formatCurrencyBRL(financePreview.balloonTotal)}</p>
              <p>Saldo parcelável: {formatCurrencyBRL(financePreview.parcelableBalance)}</p>
              <p>
                {financePreview.installmentsCount} parcelas base de{' '}
                {formatCurrencyBRL(financePreview.baseInstallmentValue)}
              </p>
              <div className="pt-1 border-t border-slate-100 space-y-2">
                {financePreview.balloonRows.map((row) => (
                  <div key={`sum-${row.installmentNumber}`}>
                    <p className="font-semibold">Parcela {row.installmentNumber}:</p>
                    <p className="pl-2 text-slate-600">
                      Base {formatCurrencyBRL(row.baseAmount)}
                    </p>
                    <p className="pl-2 text-slate-600">
                      Balão adicional {formatCurrencyBRL(row.balloonAddonAmount)}
                    </p>
                    <p className="pl-2 font-medium">
                      Valor final {formatCurrencyBRL(row.finalAmount)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="pt-1 border-t border-slate-100 font-semibold">
                Soma total final: {formatCurrencyBRL(financePreview.grandTotal)}
                {!financePreview.totalsMatch ? (
                  <span className="ml-2 text-red-700 font-normal">
                    (divergência — revise os valores)
                  </span>
                ) : null}
              </p>
            </div>
          ) : enabled ? (
            <p className="text-[11px] text-slate-500">
              Configure os balões para ver o resumo. O saldo parcelável será dividido
              normalmente e o valor do balão será somado apenas nas parcelas indicadas.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
