'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Eye, EyeOff, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  RELEASE_LOT_MOTIVE_OPTIONS,
  type ReleaseLotMotiveCode,
  type ReleaseLotPreview,
} from '@/lib/finance/releaseLotShared';

/** Inputs claros no modal GIS — evita herdar texto claro do tema escuro do mapa. */
const FIELD_CLASS =
  'form-input-light w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500';

function formatBRL(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-medium text-slate-900 text-right break-words">{value || '—'}</span>
    </div>
  );
}

export type ReleaseLotConfirmModalProps = {
  lot: {
    id: string;
    block?: string | number | null;
    number?: string | number | null;
    status?: string | null;
    projectName?: string | null;
    customerName?: string | null;
    saleId?: string | null;
    sale_id?: string | null;
    contractId?: string | null;
    contract_id?: string | null;
  };
  price: number;
  userEmail: string | undefined;
  userRole: string | undefined;
  onClose: () => void;
  onSuccess: (result: {
    lotId: string;
    message: string;
    preservedPaidReceipts: number;
    totalPaidAmount: number;
  }) => void;
};

export function ReleaseLotConfirmModal({
  lot,
  price,
  userEmail,
  userRole,
  onClose,
  onSuccess,
}: ReleaseLotConfirmModalProps) {
  const [mounted, setMounted] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [preview, setPreview] = useState<ReleaseLotPreview | null>(null);
  const [motiveCode, setMotiveCode] = useState<ReleaseLotMotiveCode | ''>('');
  const [motiveDetail, setMotiveDetail] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/lots/${encodeURIComponent(lot.id)}/release`, {
          method: 'GET',
          credentials: 'include',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            json.message || json.error || 'Falha ao carregar prévia da liberação.',
          );
        }
        if (!cancelled) setPreview(json.preview as ReleaseLotPreview);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar prévia.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lot.id]);

  useEffect(() => {
    if (previewLoading) return;
    setTimeout(() => passwordInputRef.current?.focus(), 150);
  }, [previewLoading]);

  const formatApiError = (json: Record<string, unknown>, fallback: string): string => {
    const message = String(json.message || json.error || fallback);
    const stage = json.stage ? String(json.stage) : '';
    const code = json.code ? String(json.code) : '';
    const asaasFails = (
      json.details as
        | { failedAsaasCharges?: Array<{ chargeId: string; error: string }> }
        | undefined
    )?.failedAsaasCharges;
    const parts = [message];
    if (stage) parts.push(`Etapa: ${stage}`);
    if (code) parts.push(`Código: ${code}`);
    if (asaasFails?.length) {
      parts.push(...asaasFails.map((f) => `• ${f.chargeId}: ${f.error}`));
    }
    return parts.join('\n');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;

    if (!userRole || !userRole.toUpperCase().includes('ADMIN')) {
      setError('Apenas administradores podem liberar lote e encerrar venda.');
      return;
    }
    if (!motiveCode) {
      setError('Selecione o motivo da liberação.');
      return;
    }
    if (motiveCode === 'outro' && motiveDetail.trim().length < 3) {
      setError('Descreva o motivo (campo Outro).');
      return;
    }
    if (!acknowledged) {
      setError('Marque a confirmação de ciência antes de liberar o lote.');
      return;
    }
    if (!password) {
      setError('Informe sua senha para continuar.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError('');

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail || '',
        password,
      });
      if (signInError || !data.user) {
        setError('Senha inválida. A liberação foi bloqueada.');
        return;
      }

      const res = await fetch(`/api/lots/${encodeURIComponent(lot.id)}/release`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motiveCode,
          motiveDetail: motiveDetail.trim() || null,
          acknowledged: true,
          idempotencyKey: preview?.idempotencyKey || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(formatApiError(json, 'Falha ao liberar lote.'));
        return;
      }

      onSuccess({
        lotId: String(json.lotId || lot.id),
        message: String(json.message || 'Lote liberado.'),
        preservedPaidReceipts: Number(json.preservedPaidReceipts || 0),
        totalPaidAmount: Number(json.totalPaidAmount || 0),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Erro ao validar senha ou executar liberação. ${msg}`);
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const canSubmit =
    !loading &&
    !previewLoading &&
    Boolean(preview) &&
    Boolean(motiveCode) &&
    acknowledged &&
    password.trim().length > 0 &&
    (motiveCode !== 'outro' || motiveDetail.trim().length >= 3);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans pointer-events-auto text-slate-900"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl shadow-2xl animate-in fade-in zoom-in duration-200 z-[10000] text-slate-900">
        <div className="sticky top-0 bg-white p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-lg text-slate-900">
            Liberar lote e encerrar venda?
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Esta ação deixará o lote disponível para uma nova venda. O contrato atual será
            cancelado, as parcelas e cobranças pendentes ou atrasadas serão
            removidas/canceladas, e todos os pagamentos já realizados serão preservados para
            histórico e eventual devolução.
          </p>

          {previewLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Carregando resumo da venda…
            </div>
          ) : preview ? (
            <div className="space-y-4 mb-5">
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 space-y-1.5">
                <SummaryRow label="Projeto" value={String(lot.projectName || '—')} />
                <SummaryRow
                  label="Quadra / Lote"
                  value={`${preview.quadra || lot.block || '—'} / ${preview.lote || lot.number || '—'}`}
                />
                <SummaryRow
                  label="Cliente"
                  value={preview.customerName || lot.customerName || '—'}
                />
                <SummaryRow
                  label="Contrato"
                  value={
                    preview.contractNumber
                      ? `${preview.contractNumber}${preview.contractSigned ? ' (assinado)' : ''}`
                      : preview.contractId
                        ? 'Sem número'
                        : 'Sem contrato'
                  }
                />
                <SummaryRow
                  label="Status atual"
                  value={preview.status || String(lot.status || '—')}
                />
                <SummaryRow label="Valor" value={formatBRL(preview.price ?? price)} />
                <SummaryRow
                  label="Parcelas pagas"
                  value={`${preview.paidReceipts} · ${formatBRL(preview.totalPaidAmount)}`}
                />
                <SummaryRow label="Parcelas pendentes" value={String(preview.pendingReceipts)} />
                <SummaryRow label="Parcelas atrasadas" value={String(preview.overdueReceipts)} />
                <SummaryRow
                  label="Cobranças Asaas abertas"
                  value={String(preview.openAsaasCharges)}
                />
                <SummaryRow
                  label="Documentos preservados"
                  value={String(preview.documentsPreserved)}
                />
              </div>

              {preview.hasPreservedPayments && (
                <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Existem pagamentos preservados nesta venda.</strong> Eles
                    continuarão no Financeiro e poderão ser utilizados em processo futuro de
                    devolução ou compensação.
                    <div className="mt-1 text-blue-800">
                      {preview.paidReceipts} paga(s) · {formatBRL(preview.totalPaidAmount)}
                      {preview.lastPaidAt
                        ? ` · último pagamento ${new Date(preview.lastPaidAt).toLocaleDateString('pt-BR')}`
                        : ''}
                    </div>
                  </div>
                </div>
              )}

              {preview.mode === 'simple_clear' && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-xs">
                  Não há venda ativa vinculada. O lote será liberado e os vínculos comerciais
                  temporários serão removidos.
                </div>
              )}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Motivo da liberação <span className="text-red-500">*</span>
              </label>
              <select
                value={motiveCode}
                onChange={(e) =>
                  setMotiveCode(e.target.value as ReleaseLotMotiveCode | '')
                }
                className={FIELD_CLASS}
                required
              >
                <option value="">Selecione…</option>
                {RELEASE_LOT_MOTIVE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {motiveCode === 'outro' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Descrição do motivo <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={motiveDetail}
                  onChange={(e) => setMotiveDetail(e.target.value)}
                  rows={2}
                  className={FIELD_CLASS}
                  placeholder="Descreva o motivo"
                />
              </div>
            )}

            <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-1"
              />
              <span>
                Estou ciente de que o lote será liberado e as obrigações não pagas serão
                canceladas.
              </span>
            </label>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Senha de administrador <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${FIELD_CLASS} pr-10`}
                  placeholder="Senha de acesso"
                  autoComplete="current-password"
                  style={{
                    color: '#0f172a',
                    WebkitTextFillColor: '#0f172a',
                    caretColor: '#0f172a',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm font-medium whitespace-pre-line">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold rounded-lg transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className={`flex-1 px-4 py-2 font-semibold rounded-lg transition-colors text-sm flex justify-center items-center gap-2 ${
                  !canSubmit
                    ? 'bg-red-400 cursor-not-allowed text-white'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Liberar lote e encerrar venda'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
