'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  REVENUE_SPLIT_PARTY_KIND_LABELS,
  formatSharePercent,
  type RevenueSplitPartyKind,
} from '@/lib/finance/revenueSplit';

type Participation = {
  projectId: string;
  projectName: string;
  displayName: string;
  partyKind: RevenueSplitPartyKind;
  sharePercent: number;
  isIssuerRemainder: boolean;
  financialAccountId: string | null;
  destination: { destinationIdentifier?: string | null } | null;
};

type Props = {
  ownerId: string;
  ownerName: string;
  onClose: () => void;
};

export function OwnerRevenueSplitModal({ ownerId, ownerName, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Participation[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const qs = new URLSearchParams();
      const impersonating = localStorage.getItem('impersonating_tenant_id');
      if (impersonating) qs.set('impersonatingTenantId', impersonating);
      const suffix = qs.toString() ? `?${qs}` : '';
      const res = await fetch(`/api/owners/${ownerId}/revenue-split${suffix}`, {
        headers,
        credentials: 'include',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erro ao carregar participação financeira.');
      setRows(json.participations || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar participação.');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Participação financeira</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{ownerName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--color-text-muted)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        ) : error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Este sócio ainda não participa de um Split. Cadastre a participação em Mapa GIS → Editar
            empreendimento → Distribuição de Recebimentos.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-[var(--color-text-muted)]">
                <tr>
                  <th className="py-2 pr-3">Empreendimento</th>
                  <th className="py-2 pr-3">Tipo</th>
                  <th className="py-2 pr-3">%</th>
                  <th className="py-2 pr-3">Emissor</th>
                  <th className="py-2 pr-3">Carteira</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.projectId}-${row.displayName}`} className="border-t border-[var(--color-border)]">
                    <td className="py-2 pr-3">{row.projectName}</td>
                    <td className="py-2 pr-3">{REVENUE_SPLIT_PARTY_KIND_LABELS[row.partyKind]}</td>
                    <td className="py-2 pr-3">{formatSharePercent(row.sharePercent)}%</td>
                    <td className="py-2 pr-3">{row.isIssuerRemainder ? 'Sim' : 'Não'}</td>
                    <td className="py-2 pr-3">
                      {row.isIssuerRemainder
                        ? 'Conta emissora'
                        : row.destination?.destinationIdentifier
                          ? 'Configurada'
                          : 'Não configurada'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          A participação financeira fica nas tabelas de Split, não no acesso por empreendimento.
        </p>
      </div>
    </div>
  );
}
