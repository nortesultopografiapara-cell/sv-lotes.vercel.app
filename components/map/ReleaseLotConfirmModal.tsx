'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Check,
  Eye,
  EyeOff,
  FileWarning,
  FileX,
  Handshake,
  Loader2,
  MoreHorizontal,
  ScrollText,
  ShieldAlert,
  UserX,
  X,
} from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  canConfirmReleaseLot,
  RELEASE_LOT_MOTIVE_DESCRIPTIONS,
  RELEASE_LOT_MOTIVE_OPTIONS,
  type ReleaseLotMotiveCode,
  type ReleaseLotPreview,
  validateReleaseLotMotive,
} from '@/lib/finance/releaseLotShared';
import { supabase } from '@/lib/supabase';

const FIELD_CLASS =
  'form-input-light w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500';

const MOTIVE_ICONS: Record<ReleaseLotMotiveCode, typeof UserX> = {
  desistencia: UserX,
  distrato: Handshake,
  inadimplencia: Ban,
  erro_cadastro: FileWarning,
  troca_lote: ArrowLeftRight,
  cancelamento_administrativo: ShieldAlert,
  outro: MoreHorizontal,
};

function money(value: number | null | undefined): string {
  return formatCurrencyBRL(Number(value) || 0) || 'R$ 0,00';
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 break-words">{value || '—'}</p>
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
    lotReleased?: boolean;
    ownershipTransferred?: boolean;
    newCustomerName?: string | null;
  }) => void;
};

export { canConfirmReleaseLot };

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
          throw new Error(json.message || json.error || 'Falha ao carregar a prévia da liberação.');
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

  const confirmEnabled = useMemo(
    () =>
      canConfirmReleaseLot({
        motiveCode,
        motiveDetail,
        acknowledged,
        password,
        loading,
        asaasBlockedCharges: preview?.asaasBlockedCharges,
        interBlockedCharges: preview?.interBlockedCharges,
      }),
    [
      acknowledged,
      loading,
      motiveCode,
      motiveDetail,
      password,
      preview?.asaasBlockedCharges,
      preview?.interBlockedCharges,
    ],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    if (!userRole || !userRole.toUpperCase().includes('ADMIN')) {
      setError('Apenas administradores podem liberar o lote.');
      return;
    }
    const motive = validateReleaseLotMotive({ motiveCode, motiveDetail });
    if (!motive.ok) {
      setError(motive.error);
      return;
    }
    if (!acknowledged) {
      setError('Marque a confirmação de ciência.');
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
        setError('Senha inválida. A operação foi bloqueada.');
        return;
      }
      const res = await fetch(`/api/lots/${encodeURIComponent(lot.id)}/release`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motiveCode: motive.motiveCode,
          motiveDetail: motive.motiveDetail,
          acknowledged: true,
          idempotencyKey: preview?.idempotencyKey || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.success === false) {
        const stage = json.stage ? `\nEtapa: ${json.stage}` : '';
        const code = json.code ? `\nCódigo: ${json.code}` : '';
        setError(
          `${String(json.message || json.error || 'Não foi possível liberar o lote.')}${stage}${code}`,
        );
        return;
      }
      onSuccess({
        lotId: String(json.lotId || lot.id),
        message: String(json.message || 'Lote liberado e venda encerrada.'),
        preservedPaidReceipts: Number(json.preservedPaidReceipts || preview?.paidReceipts || 0),
        totalPaidAmount: Number(json.totalPaidAmount || preview?.totalPaidAmount || 0),
        lotReleased: true,
        ownershipTransferred: false,
        newCustomerName: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao liberar o lote.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (!mounted) return null;

  const statusLabel = preview?.status || String(lot.status || '—');
  const contractLabel = preview?.contractNumber
    ? `${preview.contractNumber}${preview.contractSigned ? ' · assinado' : ''}`
    : preview?.contractId || lot.contractId || lot.contract_id
      ? 'Sem número'
      : 'Sem contrato';

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 font-sans pointer-events-auto text-slate-900"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="bg-white w-full max-w-[1000px] max-h-[94vh] flex flex-col rounded-xl shadow-2xl animate-in fade-in zoom-in duration-200 z-[10000] text-slate-900">
        <div className="shrink-0 px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg text-slate-900">Encerrar venda e liberar lote</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Esta operação encerra a venda atual e devolve o lote ao estoque disponível.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {previewLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando posição da venda…
              </div>
            ) : (
              <>
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Resumo da venda
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    <SummaryCard
                      label="Projeto"
                      value={String(lot.projectName || '—')}
                    />
                    <SummaryCard
                      label="Quadra / Lote"
                      value={`${preview?.quadra || lot.block || '—'} / ${preview?.lote || lot.number || '—'}`}
                    />
                    <SummaryCard
                      label="Cliente"
                      value={preview?.customerName || lot.customerName || '—'}
                    />
                    <SummaryCard label="Nº do contrato" value={contractLabel} />
                    <SummaryCard label="Status atual" value={statusLabel} />
                    <SummaryCard label="Valor" value={money(preview?.price ?? price)} />
                    <SummaryCard
                      label="Parcelas pagas"
                      value={`${preview?.paidReceipts ?? 0} · ${money(preview?.totalPaidAmount)}`}
                    />
                    <SummaryCard
                      label="Parcelas pendentes"
                      value={String(preview?.pendingReceipts ?? 0)}
                    />
                    <SummaryCard
                      label="Parcelas atrasadas"
                      value={String(preview?.overdueReceipts ?? 0)}
                    />
                    <SummaryCard
                      label="Cobranças Asaas canceláveis"
                      value={String(preview?.openAsaasCharges ?? 0)}
                    />
                    <SummaryCard
                      label="Cobranças bancárias canceláveis"
                      value={String(preview?.openCancelableCharges ?? 0)}
                    />
                    <SummaryCard
                      label="Documentos preservados"
                      value={String(preview?.documentsPreserved ?? 0)}
                    />
                  </div>
                  {(preview?.openInterCharges || 0) > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      Cobranças Inter canceláveis: {preview?.openInterCharges}.
                    </p>
                  )}
                </section>

                {(preview?.asaasBlockedCharges || 0) > 0 && (
                  <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-3 text-xs flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      Há cobrança(s) Asaas que não podem ser canceladas automaticamente (
                      {preview?.asaasBlockedCharges}). A liberação fica bloqueada até regularizar.
                    </div>
                  </div>
                )}
                {(preview?.interBlockedCharges || 0) > 0 && (
                  <div className="bg-red-50 border border-red-200 text-red-900 rounded-lg p-3 text-xs flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      Há cobrança(s) Banco Inter que não podem ser canceladas automaticamente (
                      {preview?.interBlockedCharges}).
                    </div>
                  </div>
                )}
                {preview?.hasPreservedPayments && (
                  <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-xs flex gap-2">
                    <ScrollText className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Existem pagamentos preservados nesta venda.</strong> Eles
                      continuarão no Financeiro e poderão ser utilizados em processo futuro de
                      devolução ou compensação.
                    </div>
                  </div>
                )}

                <section>
                  <p className="text-sm font-semibold text-slate-800 mb-2">
                    Motivo da liberação <span className="text-red-500">*</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {RELEASE_LOT_MOTIVE_OPTIONS.map((option) => {
                      const Icon = MOTIVE_ICONS[option.value];
                      const selected = motiveCode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setMotiveCode(option.value)}
                          className={`text-left rounded-xl border p-3 transition-colors ${
                            selected
                              ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-400'
                              : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/40'
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                selected ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              <Icon className="w-4 h-4" />
                            </span>
                            <span>
                              <span className="block text-sm font-semibold text-slate-900">
                                {option.label}
                              </span>
                              <span className="mt-0.5 block text-xs text-slate-600 leading-snug">
                                {RELEASE_LOT_MOTIVE_DESCRIPTIONS[option.value]}
                              </span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {motiveCode === 'outro' && (
                    <div className="mt-3">
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Descreva o motivo <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={motiveDetail}
                        onChange={(e) => setMotiveDetail(e.target.value)}
                        className={FIELD_CLASS}
                        rows={2}
                        placeholder="Informe o motivo (mínimo 3 caracteres)"
                      />
                    </div>
                  )}
                </section>

                {motiveCode ? (
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800 mb-2">O que acontecerá</p>
                    <ul className="space-y-1.5 text-sm text-slate-700">
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        A venda atual será encerrada
                      </li>
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        O lote voltará para o status Disponível
                      </li>
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        Obrigações/parcelas pendentes serão encerradas conforme a lógica atual
                      </li>
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        Cobranças externas canceláveis serão tratadas conforme integração existente
                      </li>
                      <li className="flex gap-2">
                        <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        Contrato, documentos e histórico permanecerão preservados
                      </li>
                    </ul>
                    <p className="mt-3 text-xs text-slate-500 flex gap-1.5">
                      <FileX className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      Esta tela não transfere titularidade nem troca o comprador. Cessão, se
                      necessária, é uma operação independente.
                    </p>
                  </section>
                ) : null}

                <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Estou ciente de que esta operação encerrará a venda atual e tornará o lote novamente disponível.
                  </span>
                </label>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">
                    Senha de administrador <span className="text-red-500">*</span>
                  </label>
                  <div className="relative max-w-md">
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
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <p className="text-red-600 text-sm font-medium whitespace-pre-line">{error}</p>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold rounded-lg text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!confirmEnabled}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold rounded-lg text-sm inline-flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirmar liberação do lote
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
