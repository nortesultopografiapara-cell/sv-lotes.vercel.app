'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileArchive, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { resolveActiveTenantId } from '@/lib/activeTenant';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import {
  canAccessLegacyContractsModule,
  canManageLegacyContractsModule,
} from '@/lib/legacy-contracts/permissions';
import { fetchLegacyContractList } from '@/lib/legacy-contracts/listClient';
import type {
  LegacyContractListItem,
  LegacyContractListSummary,
} from '@/lib/legacy-contracts/types';
import { LegacyContractSummaryCards } from '@/components/legacy-contracts/LegacyContractSummaryCards';
import {
  EMPTY_FILTERS,
  LegacyContractsFilters,
  type LegacyContractsFilterValues,
} from '@/components/legacy-contracts/LegacyContractsFilters';
import { LegacyContractsTable } from '@/components/legacy-contracts/LegacyContractsTable';
import { LegacyContractPdfViewer } from '@/components/legacy-contracts/LegacyContractPdfViewer';

type ProjectOption = {
  id: string;
  name: string;
};

const EMPTY_SUMMARY: LegacyContractListSummary = {
  total: 0,
  automatic: 0,
  manual: 0,
  unlinked: 0,
};

export function LegacyContractsPageClient() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const canAccess = canAccessLegacyContractsModule(user?.role);
  const canManage = canManageLegacyContractsModule(user?.role);

  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [filters, setFilters] = useState<LegacyContractsFilterValues>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<LegacyContractsFilterValues>(EMPTY_FILTERS);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LegacyContractListItem[]>([]);
  const [summary, setSummary] = useState<LegacyContractListSummary>(EMPTY_SUMMARY);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ id: string; fileName: string } | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !canAccess) {
      router.push('/dashboard');
    }
  }, [authLoading, user, canAccess, router]);

  useEffect(() => {
    if (!user || authLoading) return;

    let cancelled = false;

    void (async () => {
      const tenantId = await resolveActiveTenantId(user);
      if (!cancelled) setActiveTenantId(tenantId);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  useEffect(() => {
    if (!activeTenantId || !user?.id) return;

    let cancelled = false;

    async function loadProjects() {
      setLoadingProjects(true);
      try {
        const rlsCtx = await resolveRlsContext({
          id: user.id,
          tenant_id: activeTenantId,
          role: user.role || 'ADMIN',
        });
        let query = supabase.from('projects').select('id, name').order('name');
        query = applyTenantFilter(query, rlsCtx, 'projects');
        const { data, error: queryError } = await query;
        if (queryError) throw new Error(queryError.message);
        if (!cancelled) setProjects((data || []) as ProjectOption[]);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    }

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [activeTenantId, user?.id, user?.role]);

  const loadDocuments = useCallback(async () => {
    if (!activeTenantId) {
      setItems([]);
      setSummary(EMPTY_SUMMARY);
      setTotal(0);
      setError('Empresa ativa não identificada. Recarregue a página ou selecione a empresa novamente.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (appliedFilters.projectId) params.set('projectId', appliedFilters.projectId);
      if (appliedFilters.quadra) params.set('quadra', appliedFilters.quadra);
      if (appliedFilters.lote) params.set('lote', appliedFilters.lote);
      if (appliedFilters.customer) params.set('customer', appliedFilters.customer);
      if (appliedFilters.fileName) params.set('fileName', appliedFilters.fileName);
      if (appliedFilters.linkType) params.set('linkType', appliedFilters.linkType);
      params.set('page', String(page));
      params.set('pageSize', '25');
      params.set('activeTenantId', activeTenantId);

      const payload = await fetchLegacyContractList(params);
      setItems(payload.items || []);
      setSummary(payload.summary || EMPTY_SUMMARY);
      setTotal(payload.total || 0);
    } catch (err) {
      setItems([]);
      setSummary(EMPTY_SUMMARY);
      setTotal(0);
      setError(err instanceof Error ? err.message : 'Erro ao carregar contratos antigos.');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, appliedFilters, page]);

  useEffect(() => {
    if (!canAccess || authLoading || !activeTenantId) return;
    void loadDocuments();
  }, [canAccess, authLoading, activeTenantId, loadDocuments]);

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedFilters(filters);
  };

  const handleClearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const handleDownload = async (item: LegacyContractListItem) => {
    try {
      const response = await fetch(
        `/api/legacy-contracts/${encodeURIComponent(item.id)}/pdf?format=json`,
        { credentials: 'same-origin' },
      );
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Não foi possível baixar o PDF.',
        );
      }
      const url = typeof payload.url === 'string' ? payload.url : '';
      if (!url) throw new Error('URL do PDF indisponível.');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível baixar o PDF.');
    }
  };

  const handleDelete = async (item: LegacyContractListItem) => {
    const confirmed = window.confirm(
      `Arquivar o contrato antigo "${item.original_file_name}"?\n\nO documento deixará de aparecer nesta listagem.`,
    );
    if (!confirmed) return;

    setDeletingId(item.id);
    try {
      const response = await fetch(`/api/legacy-contracts/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        throw new Error(
          (typeof payload.error === 'string' && payload.error) ||
            'Não foi possível arquivar o contrato.',
        );
      }
      await loadDocuments();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível arquivar o contrato.');
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading || !user || !canAccess) {
    return (
      <div className="sv-page sv-page--scroll-y p-6 text-[var(--text-muted)]">Carregando…</div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div
      className="sv-page sv-page--scroll-y p-4 md:p-6 lg:p-8 flex flex-col min-h-0 flex-1 bg-[var(--bg-main)] text-[var(--text-primary)]"
      data-testid="legacy-contracts-page"
    >
      <header className="mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
            <FileArchive className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Contratos Antigos</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-3xl">
              Consulte, filtre e visualize os PDFs históricos importados pela Migração de Contratos
              Antigos. Estes documentos não substituem os contratos ativos do sistema.
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-6">
        <LegacyContractSummaryCards summary={summary} />

        <LegacyContractsFilters
          values={filters}
          projects={projects}
          loadingProjects={loadingProjects}
          onChange={setFilters}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
        />

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadDocuments()}
              className="inline-flex items-center gap-2 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-100"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </button>
          </div>
        ) : null}

        <LegacyContractsTable
          items={items}
          loading={loading}
          canManage={canManage}
          deletingId={deletingId}
          onView={(item) => setViewer({ id: item.id, fileName: item.original_file_name })}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />

        {totalPages > 1 ? (
          <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
            <span>
              Página {page} de {totalPages} — {total} registro(s)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <LegacyContractPdfViewer
        open={viewer != null}
        documentId={viewer?.id || null}
        fileName={viewer?.fileName || ''}
        onClose={() => setViewer(null)}
      />
    </div>
  );
}
