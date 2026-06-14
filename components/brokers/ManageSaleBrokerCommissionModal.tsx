'use client';

import { useEffect, useState } from 'react';
import { Loader2, UserCog, X } from 'lucide-react';

type BrokerOption = {
  id: string;
  name: string;
  commission_percent?: number | string | null;
};

type ManageSaleBrokerCommissionModalProps = {
  open: boolean;
  onClose: () => void;
  saleId: string;
  lotLabel: string;
  contractLabel: string;
  saleValue: number;
  currentBrokerName?: string;
  initialPendingTotal?: number;
  activeTenantId?: string | null;
  canManage: boolean;
  brokers: BrokerOption[];
  onSuccess: () => void;
};

type CommissionMode = 'percent' | 'fixed' | 'cancel' | 'remove' | 'transfer';

export function ManageSaleBrokerCommissionModal({
  open,
  onClose,
  saleId,
  lotLabel,
  contractLabel,
  saleValue,
  currentBrokerName,
  initialPendingTotal = 0,
  activeTenantId = null,
  canManage,
  brokers,
  onSuccess,
}: ManageSaleBrokerCommissionModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [pendingTotal, setPendingTotal] = useState(initialPendingTotal);
  const [brokerId, setBrokerId] = useState<string | null>(null);
  const [mode, setMode] = useState<CommissionMode>('transfer');
  const [targetBrokerId, setTargetBrokerId] = useState('');
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [fixedAmount, setFixedAmount] = useState(0);

  useEffect(() => {
    if (!open) return;
    setPendingTotal(initialPendingTotal);
    setError('');
    setMode('transfer');
    setTargetBrokerId('');
  }, [open, initialPendingTotal, saleId]);

  const tenantQuery = activeTenantId
    ? `?activeTenantId=${encodeURIComponent(activeTenantId)}`
    : '';

  useEffect(() => {
    if (!open || !saleId || !canManage) return;

    let cancelled = false;
    async function loadState() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/sales/${saleId}/broker-commission${tenantQuery}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Falha ao carregar comissão');
        }
        if (cancelled) return;
        setPendingTotal(Number(data.pending_total) || 0);
        setBrokerId(data.sale?.broker_id ?? null);
        setCommissionPercent(Number(data.broker?.commission_percent) || 0);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erro ao carregar');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadState();
    return () => {
      cancelled = true;
    };
  }, [open, saleId, canManage, tenantQuery]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  async function submitAction() {
    if (!canManage) return;
    setSubmitting(true);
    setError('');

    let payload: Record<string, unknown> = { action: '' };

    if (mode === 'remove') {
      payload = { action: 'remove_broker' };
    } else if (mode === 'transfer') {
      if (!targetBrokerId) {
        setError('Selecione o corretor de destino.');
        setSubmitting(false);
        return;
      }
      payload = { action: 'transfer_broker', broker_id: targetBrokerId };
    } else if (mode === 'cancel') {
      payload = { action: 'cancel_commission' };
    } else if (mode === 'percent') {
      payload = { action: 'update_commission', commission_percent: commissionPercent };
    } else if (mode === 'fixed') {
      payload = { action: 'update_commission', fixed_amount: fixedAmount };
    }

    if (activeTenantId) {
      payload.activeTenantId = activeTenantId;
    }

    try {
      const res = await fetch(`/api/sales/${saleId}/broker-commission`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-color)] bg-[var(--bg-card-alt)]">
          <div className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Gerenciar corretor/comissão</h2>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          <div className="text-sm text-[var(--text-secondary)] space-y-1">
            <p><span className="font-semibold text-[var(--text-primary)]">Lote:</span> {lotLabel || '—'}</p>
            <p><span className="font-semibold text-[var(--text-primary)]">Contrato:</span> {contractLabel || '—'}</p>
            <p><span className="font-semibold text-[var(--text-primary)]">Valor da venda:</span> {formatCurrency(saleValue)}</p>
            <p><span className="font-semibold text-[var(--text-primary)]">Corretor atual:</span> {currentBrokerName || 'Sem corretor'}</p>
            <p><span className="font-semibold text-[var(--text-primary)]">Comissão pendente:</span> {formatCurrency(pendingTotal)}</p>
          </div>

          {!canManage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
              Apenas administradores podem gerenciar corretor/comissão da venda.
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
            </div>
          ) : canManage ? (
            <>
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Ação</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as CommissionMode)}
                  className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 px-3 text-sm"
                >
                  <option value="transfer">Transferir para outro corretor</option>
                  <option value="remove">Remover corretor da venda</option>
                  <option value="percent">Alterar comissão (%)</option>
                  <option value="fixed">Alterar comissão (valor fixo R$)</option>
                  <option value="cancel">Cancelar comissão pendente</option>
                </select>
              </div>

              {mode === 'transfer' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Novo corretor</label>
                  <select
                    value={targetBrokerId}
                    onChange={(e) => setTargetBrokerId(e.target.value)}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 px-3 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {brokers
                      .filter((b) => b.id !== brokerId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({Number(b.commission_percent) || 0}%)
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-[var(--text-muted)]">
                    A comissão pendente atual será cancelada. Se o novo corretor tiver 0%, nenhuma pendência será criada.
                  </p>
                </div>
              )}

              {mode === 'percent' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Comissão (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 px-3 text-sm"
                  />
                  <p className="text-xs text-[var(--text-muted)]">Use 0% para zerar/cancelar a pendência sem alterar o caixa.</p>
                </div>
              )}

              {mode === 'fixed' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">Valor fixo (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={fixedAmount}
                    onChange={(e) => setFixedAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                    className="w-full bg-[var(--bg-main)] border border-[var(--border-color)] rounded-lg py-2.5 px-3 text-sm"
                  />
                </div>
              )}

              {(mode === 'remove' || mode === 'cancel') && (
                <p className="text-xs text-amber-500/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  Esta ação cancela apenas a comissão pendente. Não cria saída no caixa nem altera o fluxo de caixa.
                  Comissões já pagas exigem estorno manual no Financeiro.
                </p>
              )}
            </>
          ) : null}
        </div>

        <div className="p-5 border-t border-[var(--border-color)] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Cancelar
          </button>
          {canManage && (
            <button
              onClick={submitAction}
              disabled={loading || submitting}
              className="px-6 py-2 text-sm font-bold rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirmar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
