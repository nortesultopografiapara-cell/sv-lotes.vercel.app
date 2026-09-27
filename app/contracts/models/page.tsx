'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { resolveActiveTenantId } from '@/lib/activeTenant';
import { applyTenantIdEq, resolveRlsContext } from '@/lib/rls';
import {
  CONTRACT_MODEL_CATALOG_SEED,
  pickPublishedVersionNumber,
  type CompanyContractModelRecord,
} from '@/lib/contractModelCentral';
import { SALE_CONTRACT_MODEL_LABELS, type SaleContractModel } from '@/lib/contractModel';

type ModelRow = {
  id: string;
  company_id: string;
  catalog_code: string;
  engine_key: string;
  name: string;
  status: string;
  source: string;
  is_company_default: boolean;
};

type VersionRow = {
  model_id: string;
  version: number;
  status: string;
};

type LinkRow = {
  company_contract_model_id: string;
  project_id: string;
  is_project_default: boolean;
};

export default function ContractModelsCentralPage() {
  const { user, loading: authLoading } = useSessionGuard();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<CompanyContractModelRecord[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const activeTenantId = user ? await resolveActiveTenantId(user) : null;
      if (!activeTenantId) {
        if (!cancelled) {
          setTenantId(null);
          setModels([]);
          setLoading(false);
        }
        return;
      }
      const ctx = await resolveRlsContext(user);
      setTenantId(activeTenantId);

      let modelsQuery = supabase
        .from('company_contract_models')
        .select(
          'id, company_id, catalog_code, engine_key, name, status, source, is_company_default',
        )
        .eq('company_id', activeTenantId)
        .order('name');
      modelsQuery = applyTenantIdEq(modelsQuery, ctx, 'company_contract_models', 'company_id');

      const { data: modelRows, error: modelError } = await modelsQuery;
      if (cancelled) return;
      if (modelError) {
        setError(modelError.message);
        setLoading(false);
        return;
      }

      const scoped = ((modelRows ?? []) as ModelRow[]).filter(
        (row) => String(row.company_id) === String(activeTenantId),
      );
      const ids = scoped.map((row) => row.id);

      let versions: VersionRow[] = [];
      let links: LinkRow[] = [];
      const projectNames = new Map<string, string>();

      if (ids.length > 0) {
        const { data: versionRows } = await supabase
          .from('company_contract_model_versions')
          .select('model_id, version, status, company_id')
          .eq('company_id', activeTenantId)
          .in('model_id', ids);
        versions = ((versionRows ?? []) as Array<VersionRow & { company_id?: string }>).filter(
          (row) => String(row.company_id ?? activeTenantId) === String(activeTenantId),
        );

        const { data: linkRows } = await supabase
          .from('project_contract_model_links')
          .select('company_contract_model_id, project_id, is_project_default, company_id')
          .eq('company_id', activeTenantId)
          .in('company_contract_model_id', ids);
        links = ((linkRows ?? []) as Array<LinkRow & { company_id?: string }>).filter(
          (row) => String(row.company_id ?? activeTenantId) === String(activeTenantId),
        );

        const projectIds = [...new Set(links.map((row) => row.project_id))];
        if (projectIds.length > 0) {
          const { data: projectRows } = await supabase
            .from('projects')
            .select('id, name, tenant_id, company_id')
            .in('id', projectIds);
          for (const project of projectRows ?? []) {
            const company = String(project.company_id || project.tenant_id || '');
            if (company && company !== String(activeTenantId)) continue;
            projectNames.set(String(project.id), String(project.name || 'Empreendimento'));
          }
        }
      }

      const records: CompanyContractModelRecord[] = scoped.map((row) => {
        const catalogCode = row.catalog_code as SaleContractModel;
        const modelVersions = versions.filter((v) => v.model_id === row.id);
        const modelLinks = links.filter((l) => l.company_contract_model_id === row.id);
        return {
          id: row.id,
          companyId: row.company_id,
          catalogCode,
          engineKey: row.engine_key,
          name: row.name,
          status: row.status === 'archived' ? 'archived' : 'active',
          source: (row.source as CompanyContractModelRecord['source']) || 'system_seed',
          isCompanyDefault: row.is_company_default === true,
          publishedVersion: pickPublishedVersionNumber(modelVersions),
          projectNames: modelLinks
            .map((link) => projectNames.get(link.project_id))
            .filter((name): name is string => Boolean(name)),
        };
      });

      setModels(records);
      setError(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const catalogHint = useMemo(
    () => CONTRACT_MODEL_CATALOG_SEED.map((row) => row.code).join(', '),
    [],
  );

  if (authLoading) return null;

  return (
    <div className="sv-page flex h-full min-w-0 font-sans bg-[var(--color-background)] overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center gap-3">
          <a
            href="/contracts"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-surface)] text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div>
            <h1 className="text-lg font-bold text-white">Central de Modelos de Contrato</h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              Visualização da estrutura. Os motores TypeScript continuam gerando os contratos atuais.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Carregando modelos…
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-amber-200">
            Não foi possível carregar a Central ({error}). Se a migration ainda não foi aplicada no
            Preview, a geração de contratos atuais permanece inalterada pelos campos texto
            <code className="mx-1">contract_model</code>.
          </div>
        ) : !tenantId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)]">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p>Empresa não identificada.</p>
          </div>
        ) : models.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)] p-6 text-center">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p>Nenhum modelo instanciado para esta empresa ainda.</p>
            <p className="text-xs mt-2 max-w-md">
              Catálogo do sistema: {catalogHint}. Sem seed, a venda continua usando o modelo texto
              da empresa/empreendimento.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 sv-scrollbar sv-scrollbar-dark">
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-sm text-left">
                <thead className="bg-[var(--color-surface)] text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  <tr>
                    <th className="px-3 py-3 font-semibold">Nome do modelo</th>
                    <th className="px-3 py-3 font-semibold">Motor / código</th>
                    <th className="px-3 py-3 font-semibold">Padrão da empresa</th>
                    <th className="px-3 py-3 font-semibold">Empreendimentos associados</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Versão publicada</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr
                      key={model.id}
                      className="border-t border-[var(--color-border)] text-[var(--text-secondary)]"
                    >
                      <td className="px-3 py-3 text-[var(--text-primary)] font-medium">
                        {model.name}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">
                        {model.catalogCode}
                        <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                          {SALE_CONTRACT_MODEL_LABELS[model.catalogCode] || model.engineKey}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {model.isCompanyDefault ? (
                          <span className="text-[var(--color-success)] font-semibold">Sim</span>
                        ) : (
                          'Não'
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {model.projectNames.length > 0
                          ? model.projectNames.join(', ')
                          : '—'}
                      </td>
                      <td className="px-3 py-3">
                        {model.status === 'archived' ? 'Arquivado' : 'Ativo'}
                      </td>
                      <td className="px-3 py-3">
                        {model.publishedVersion != null ? `v${model.publishedVersion}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-3">
              CUSTOM importado do editor legado não gera contrato GIS nesta etapa. Mundo Novo, LF e
              Araguaia permanecem nos motores TypeScript.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
