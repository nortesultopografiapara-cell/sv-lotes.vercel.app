'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Archive,
  ArrowLeft,
  Copy,
  Eye,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  Plus,
  Save,
  Settings2,
  Upload,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { resolveActiveTenantId } from '@/lib/activeTenant';
import { applyTenantIdEq, resolveRlsContext, withTenantFields } from '@/lib/rls';
import {
  pickPublishedVersionNumber,
} from '@/lib/contractModelCentral';
import { SALE_CONTRACT_MODEL_LABELS, type SaleContractModel } from '@/lib/contractModel';
import {
  ARCHIVE_DEFAULT_BLOCKED,
  CUSTOM_NOT_IN_AUTO_EMISSION,
  LEGAL_TEXT_LOCKED,
  legalContentIsLocked,
  nextCopyName,
  showsAutoEmissionPending,
} from '@/lib/contractModelCentralOps';
import { isPartnerPanelAdmin } from '@/lib/partnerPanelAdmin';

type ModelRow = {
  id: string;
  company_id: string;
  catalog_code: string;
  engine_key: string;
  name: string;
  status: string;
  source: string;
  is_company_default: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type VersionRow = {
  id: string;
  model_id: string;
  company_id: string;
  version: number;
  status: string;
  content_html: string | null;
  engine_params_json: Record<string, unknown> | null;
  created_at: string | null;
};

type LinkRow = {
  id: string;
  company_contract_model_id: string;
  project_id: string;
  company_id: string;
  is_project_default: boolean;
};

type ProjectOpt = { id: string; name: string; companyId: string };

type Dialog =
  | { type: 'sheet'; modelId: string }
  | { type: 'view'; modelId: string }
  | { type: 'history'; modelId: string }
  | { type: 'associate'; modelId: string }
  | { type: 'saveAs'; modelId: string }
  | { type: 'new' }
  | { type: 'import' };

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function originLabel(source: string): string {
  if (source === 'system_seed') return 'Modelo do sistema';
  if (source === 'legacy_template') return 'Importado (legado)';
  return 'Criado pela empresa';
}

export default function ContractModelsOperationalCentral() {
  const { user, loading: authLoading } = useSessionGuard();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [saveAsName, setSaveAsName] = useState('');
  const [newName, setNewName] = useState('');
  const [newMode, setNewMode] = useState<'existing' | 'custom'>('existing');
  const [newBaseId, setNewBaseId] = useState('');
  const [newProjectId, setNewProjectId] = useState('');
  const [newCompanyDefault, setNewCompanyDefault] = useState(false);
  const [newProjectDefault, setNewProjectDefault] = useState(false);
  const [importName, setImportName] = useState('');
  const [importHtml, setImportHtml] = useState('');
  const [importFile, setImportFile] = useState<{ name: string; mime: string } | null>(null);
  const [associateProjectId, setAssociateProjectId] = useState('');
  const [associateAsDefault, setAssociateAsDefault] = useState(true);

  const canOperate = isPartnerPanelAdmin(user?.role);

  const reload = useCallback(async () => {
    const activeTenantId = user ? await resolveActiveTenantId(user) : null;
    if (!activeTenantId) {
      setTenantId(null);
      setModels([]);
      setLoading(false);
      return;
    }
    const ctx = await resolveRlsContext(user);
    setTenantId(activeTenantId);

    let modelsQuery = supabase
      .from('company_contract_models')
      .select(
        'id, company_id, catalog_code, engine_key, name, status, source, is_company_default, created_at, updated_at',
      )
      .eq('company_id', activeTenantId)
      .order('name');
    modelsQuery = applyTenantIdEq(modelsQuery, ctx, 'company_contract_models', 'company_id');
    const { data: modelRows, error: modelError } = await modelsQuery;
    if (modelError) {
      setError(modelError.message);
      setLoading(false);
      return;
    }
    const scoped = ((modelRows ?? []) as ModelRow[]).filter(
      (row) => String(row.company_id) === String(activeTenantId),
    );
    const ids = scoped.map((row) => row.id);

    let versionRows: VersionRow[] = [];
    let linkRows: LinkRow[] = [];
    if (ids.length > 0) {
      const { data: vrows } = await supabase
        .from('company_contract_model_versions')
        .select(
          'id, model_id, company_id, version, status, content_html, engine_params_json, created_at',
        )
        .eq('company_id', activeTenantId)
        .in('model_id', ids);
      versionRows = ((vrows ?? []) as VersionRow[]).filter(
        (row) => String(row.company_id) === String(activeTenantId),
      );
      const { data: lrows } = await supabase
        .from('project_contract_model_links')
        .select('id, company_contract_model_id, project_id, company_id, is_project_default')
        .eq('company_id', activeTenantId)
        .in('company_contract_model_id', ids);
      linkRows = ((lrows ?? []) as LinkRow[]).filter(
        (row) => String(row.company_id) === String(activeTenantId),
      );
    }

    const { data: projectRows } = await supabase
      .from('projects')
      .select('id, name, company_id, tenant_id')
      .order('name');
    const scopedProjects: ProjectOpt[] = [];
    for (const project of projectRows ?? []) {
      const company = String(project.company_id || project.tenant_id || '');
      if (company !== String(activeTenantId)) continue;
      scopedProjects.push({
        id: String(project.id),
        name: String(project.name || 'Empreendimento'),
        companyId: company,
      });
    }

    setModels(scoped);
    setVersions(versionRows);
    setLinks(linkRows);
    setProjects(scopedProjects);
    setError(null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) map.set(project.id, project.name);
    return map;
  }, [projects]);

  const modelById = useMemo(() => {
    const map = new Map<string, ModelRow>();
    for (const model of models) map.set(model.id, model);
    return map;
  }, [models]);

  const linksByModel = useCallback(
    (modelId: string) => links.filter((l) => l.company_contract_model_id === modelId),
    [links],
  );

  const publishedVersion = useCallback(
    (modelId: string) => pickPublishedVersionNumber(versions.filter((v) => v.model_id === modelId)),
    [versions],
  );

  const companyDefault = models.find((m) => m.is_company_default && m.status === 'active') || null;

  const projectDefaultRows = useMemo(() => {
    return links
      .filter((l) => l.is_project_default)
      .map((l) => ({
        project: projectNameById.get(l.project_id) || 'Empreendimento',
        model: modelById.get(l.company_contract_model_id)?.name || 'Modelo',
      }));
  }, [links, projectNameById, modelById]);

  function openSheet(model: ModelRow) {
    setRenameDraft(model.name);
    setDialog({ type: 'sheet', modelId: model.id });
    setMenuId(null);
  }

  async function run(action: () => Promise<void>, okMessage?: string) {
    if (!canOperate) {
      setError('Você não tem permissão para alterar modelos.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await action();
      await reload();
      if (okMessage) setNotice(okMessage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir a operação.');
    } finally {
      setSaving(false);
    }
  }

  async function swapCompanyDefault(modelId: string) {
    if (!tenantId) return;
    const now = new Date().toISOString();
    const { error: unsetError } = await supabase
      .from('company_contract_models')
      .update({ is_company_default: false, updated_at: now })
      .eq('company_id', tenantId)
      .eq('is_company_default', true);
    if (unsetError) throw new Error(unsetError.message);
    const { error: setError } = await supabase
      .from('company_contract_models')
      .update({ is_company_default: true, status: 'active', updated_at: now })
      .eq('id', modelId)
      .eq('company_id', tenantId);
    if (setError) throw new Error(setError.message);
  }

  async function insertVersion(modelId: string, contentHtml: string | null, params?: object | null) {
    if (!tenantId) return;
    const payload = withTenantFields(
      {
        model_id: modelId,
        company_id: tenantId,
        version: 1,
        status: 'published',
        content_html: contentHtml,
        engine_params_json: params ?? null,
        created_by: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          String(user?.id || ''),
        )
          ? user?.id
          : null,
      },
      tenantId,
      'company_contract_model_versions',
    );
    const { error: versionError } = await supabase
      .from('company_contract_model_versions')
      .insert(payload);
    if (versionError) throw new Error(versionError.message);
  }

  async function insertModel(input: {
    name: string;
    catalogCode: string;
    engineKey: string;
    contentHtml?: string | null;
    params?: object | null;
  }): Promise<string> {
    if (!tenantId) throw new Error('Empresa não identificada.');
    const payload = withTenantFields(
      {
        company_id: tenantId,
        tenant_id: tenantId,
        catalog_code: input.catalogCode,
        engine_key: input.engineKey,
        name: input.name,
        status: 'active',
        source: 'user',
        is_company_default: false,
      },
      tenantId,
      'company_contract_models',
    );
    const { data, error: insertError } = await supabase
      .from('company_contract_models')
      .insert(payload)
      .select('id')
      .single();
    if (insertError || !data?.id) throw new Error(insertError?.message || 'Não foi possível criar o modelo.');
    await insertVersion(String(data.id), input.contentHtml ?? null, input.params);
    return String(data.id);
  }

  async function handleRename(model: ModelRow) {
    const name = renameDraft.trim();
    if (!name) throw new Error('Informe o nome do modelo.');
    if (!tenantId) return;
    const { error: updateError } = await supabase
      .from('company_contract_models')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', model.id)
      .eq('company_id', tenantId);
    if (updateError) throw new Error(updateError.message);
  }

  async function handleDuplicate(model: ModelRow, customName?: string) {
    if (!tenantId) return;
    const names = models.filter((m) => m.company_id === tenantId).map((m) => m.name);
    const name = (customName || nextCopyName(model.name, names)).trim();
    const pub = versions
      .filter((v) => v.model_id === model.id && v.status === 'published')
      .sort((a, b) => b.version - a.version)[0];
    const isCustom = model.catalog_code === 'CUSTOM';
    await insertModel({
      name,
      catalogCode: model.catalog_code,
      engineKey: model.engine_key,
      contentHtml: isCustom ? pub?.content_html ?? null : null,
      params: isCustom ? pub?.engine_params_json ?? null : null,
    });
  }

  async function handleArchiveToggle(model: ModelRow) {
    if (!tenantId) return;
    if (model.status === 'active') {
      if (model.is_company_default) throw new Error(ARCHIVE_DEFAULT_BLOCKED);
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('company_contract_models')
        .update({ status: 'archived', is_company_default: false, updated_at: now })
        .eq('id', model.id)
        .eq('company_id', tenantId);
      if (updateError) throw new Error(updateError.message);
      await supabase
        .from('project_contract_model_links')
        .update({ is_project_default: false })
        .eq('company_contract_model_id', model.id)
        .eq('company_id', tenantId)
        .eq('is_project_default', true);
      return;
    }
    const { error: updateError } = await supabase
      .from('company_contract_models')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', model.id)
      .eq('company_id', tenantId);
    if (updateError) throw new Error(updateError.message);
  }

  async function handleAssociate(
    model: ModelRow,
    projectId: string,
    asDefault: boolean,
  ) {
    if (!tenantId) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Escolha um empreendimento.');
    if (project.companyId !== tenantId) throw new Error('Empreendimento de outra empresa.');
    const existing = links.find(
      (l) => l.company_contract_model_id === model.id && l.project_id === project.id,
    );
    let linkId = existing?.id;
    if (!linkId) {
      const payload = withTenantFields(
        {
          project_id: project.id,
          company_id: tenantId,
          company_contract_model_id: model.id,
          is_project_default: false,
        },
        tenantId,
        'project_contract_model_links',
      );
      const { data, error: insertError } = await supabase
        .from('project_contract_model_links')
        .insert(payload)
        .select('id')
        .single();
      if (insertError || !data?.id) throw new Error(insertError?.message || 'Não foi possível associar.');
      linkId = String(data.id);
    }
    if (asDefault) {
      const { error: unsetError } = await supabase
        .from('project_contract_model_links')
        .update({ is_project_default: false })
        .eq('project_id', project.id)
        .eq('company_id', tenantId)
        .eq('is_project_default', true);
      if (unsetError) throw new Error(unsetError.message);
      const { error: setError } = await supabase
        .from('project_contract_model_links')
        .update({ is_project_default: true })
        .eq('id', linkId)
        .eq('company_id', tenantId);
      if (setError) throw new Error(setError.message);
    }
  }

  async function handleDetach(modelId: string, projectId: string) {
    if (!tenantId) return;
    const { error: deleteError } = await supabase
      .from('project_contract_model_links')
      .delete()
      .eq('company_contract_model_id', modelId)
      .eq('project_id', projectId)
      .eq('company_id', tenantId);
    if (deleteError) throw new Error(deleteError.message);
  }

  const selected =
    dialog && 'modelId' in dialog ? modelById.get(dialog.modelId) || null : null;

  if (authLoading) return null;

  return (
    <div className="sv-page flex h-full min-w-0 font-sans bg-[var(--color-background)] overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-4 border-b border-[var(--color-border)] flex flex-wrap items-center gap-3">
          <a
            href="/contracts"
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--color-surface)] text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </a>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-white">Central de Modelos de Contrato</h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              Organize os modelos da empresa. A emissão automática dos contratos de venda continua
              como está hoje.
            </p>
          </div>
          {canOperate && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setNewName('');
                  setNewMode('existing');
                  setNewBaseId(models.find((m) => m.status === 'active')?.id || '');
                  setNewProjectId('');
                  setNewCompanyDefault(false);
                  setNewProjectDefault(false);
                  setDialog({ type: 'new' });
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                Novo Modelo
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportName('');
                  setImportHtml('');
                  setImportFile(null);
                  setDialog({ type: 'import' });
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs font-medium text-[var(--text-secondary)] hover:text-white"
              >
                <Upload className="w-4 h-4" />
                Importar Contrato
              </button>
            </div>
          )}
        </div>

        {notice && (
          <div className="mx-4 mt-3 text-xs text-emerald-200 bg-emerald-950/40 border border-emerald-800 rounded-lg px-3 py-2 flex justify-between gap-3">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-emerald-300">
              Fechar
            </button>
          </div>
        )}
        {error && (
          <div className="mx-4 mt-3 text-xs text-amber-200 bg-amber-950/40 border border-amber-800 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-[var(--color-text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Carregando modelos…
          </div>
        ) : !tenantId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--color-text-muted)]">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p>Empresa não identificada.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 sv-scrollbar sv-scrollbar-dark space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold mb-2">
                Empresa → Empreendimento → Modelo padrão
              </p>
              <p className="text-[var(--text-primary)]">
                Padrão da empresa:{' '}
                <strong>{companyDefault?.name || 'Nenhum modelo padrão ativo'}</strong>
              </p>
              {projectDefaultRows.length === 0 ? (
                <p className="text-[var(--color-text-muted)] text-xs mt-1">
                  Nenhum empreendimento com modelo próprio. Eles usam o padrão da empresa.
                </p>
              ) : (
                <ul className="mt-2 text-xs text-[var(--text-secondary)] space-y-1">
                  {projectDefaultRows.map((row) => (
                    <li key={`${row.project}-${row.model}`}>
                      {row.project} → {row.model}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {models.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-[var(--color-text-muted)] p-10 text-center">
                <FileText className="w-12 h-12 mb-3 opacity-30" />
                <p>Nenhum modelo nesta empresa ainda.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[var(--color-surface)] text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Nome do modelo</th>
                      <th className="px-3 py-3 font-semibold">Empreendimento</th>
                      <th className="px-3 py-3 font-semibold">Padrão</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Versão</th>
                      <th className="px-3 py-3 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((model) => {
                      const modelLinks = linksByModel(model.id);
                      const names = modelLinks
                        .map((l) => projectNameById.get(l.project_id))
                        .filter((n): n is string => Boolean(n));
                      const isProjectDefault = modelLinks.some((l) => l.is_project_default);
                      const version = publishedVersion(model.id);
                      return (
                        <tr
                          key={model.id}
                          className="border-t border-[var(--color-border)] text-[var(--text-secondary)]"
                        >
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => openSheet(model)}
                              className="text-left text-[var(--text-primary)] font-medium hover:underline"
                            >
                              {model.name}
                            </button>
                            {showsAutoEmissionPending(model.catalog_code, model.source) && (
                              <div className="text-[10px] text-amber-300 mt-1">
                                {CUSTOM_NOT_IN_AUTO_EMISSION}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">{names.length ? names.join(', ') : '—'}</td>
                          <td className="px-3 py-3">
                            {model.is_company_default ? (
                              <span className="text-[var(--color-success)] font-semibold">Empresa</span>
                            ) : isProjectDefault ? (
                              'Empreendimento'
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-3">
                            {model.status === 'archived' ? 'Arquivado' : 'Ativo'}
                          </td>
                          <td className="px-3 py-3">{version != null ? `v${version}` : '—'}</td>
                          <td className="px-3 py-3 text-right relative">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[var(--color-surface)]"
                              onClick={() => setMenuId(menuId === model.id ? null : model.id)}
                              aria-label="Ações do modelo"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {menuId === model.id && (
                              <div className="absolute right-3 top-10 z-20 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-xl py-1 text-left">
                                <ActionItem icon={Eye} label="Visualizar" onClick={() => { setDialog({ type: 'view', modelId: model.id }); setMenuId(null); }} />
                                <ActionItem icon={Settings2} label="Configurar/Editar" onClick={() => openSheet(model)} />
                                <ActionItem icon={Copy} label="Duplicar" onClick={() => { setMenuId(null); void run(() => handleDuplicate(model), 'Modelo duplicado.'); }} />
                                <ActionItem icon={Save} label="Salvar como novo" onClick={() => { setSaveAsName(`Cópia de ${model.name}`); setDialog({ type: 'saveAs', modelId: model.id }); setMenuId(null); }} />
                                <ActionItem icon={FileText} label="Associar a empreendimento" onClick={() => { setAssociateProjectId(projects[0]?.id || ''); setAssociateAsDefault(true); setDialog({ type: 'associate', modelId: model.id }); setMenuId(null); }} />
                                <ActionItem icon={History} label="Histórico" onClick={() => { setDialog({ type: 'history', modelId: model.id }); setMenuId(null); }} />
                                <ActionItem
                                  icon={Archive}
                                  label={model.status === 'archived' ? 'Desarquivar' : 'Arquivar'}
                                  onClick={() => {
                                    setMenuId(null);
                                    void run(
                                      () => handleArchiveToggle(model),
                                      model.status === 'archived' ? 'Modelo desarquivado.' : 'Modelo arquivado.',
                                    );
                                  }}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {dialog?.type === 'sheet' && selected && (
        <Modal title="Modelo de contrato" onClose={() => setDialog(null)} wide>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Field label="Nome do modelo">
              <input
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white"
              />
            </Field>
            <Field label="Motor / código">
              <div className="text-white font-mono text-xs">
                {selected.catalog_code}
                <div className="text-[11px] text-[var(--color-text-muted)] font-sans mt-0.5">
                  {SALE_CONTRACT_MODEL_LABELS[selected.catalog_code as SaleContractModel] ||
                    selected.engine_key}
                </div>
              </div>
            </Field>
            <Field label="Origem">{originLabel(selected.source)}</Field>
            <Field label="Status">{selected.status === 'archived' ? 'Arquivado' : 'Ativo'}</Field>
            <Field label="Versão publicada">
              {publishedVersion(selected.id) != null ? `v${publishedVersion(selected.id)}` : '—'}
            </Field>
            <Field label="Modelo padrão da empresa">
              {selected.is_company_default ? 'Sim' : 'Não'}
            </Field>
            <Field label="Criado em">{fmtDate(selected.created_at)}</Field>
            <Field label="Última alteração">{fmtDate(selected.updated_at)}</Field>
          </dl>

          {legalContentIsLocked(selected.catalog_code) && (
            <p className="mt-4 text-xs text-sky-200 bg-sky-950/40 border border-sky-800 rounded-lg px-3 py-2">
              {LEGAL_TEXT_LOCKED}
            </p>
          )}
          {showsAutoEmissionPending(selected.catalog_code, selected.source) && (
            <p className="mt-3 text-xs text-amber-200 bg-amber-950/40 border border-amber-800 rounded-lg px-3 py-2">
              {CUSTOM_NOT_IN_AUTO_EMISSION}
            </p>
          )}

          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-semibold mb-2">
              Empreendimentos associados
            </p>
            {linksByModel(selected.id).length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">Nenhum empreendimento associado.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {linksByModel(selected.id).map((link) => (
                  <li key={link.id} className="flex items-center justify-between gap-2">
                    <span>
                      {projectNameById.get(link.project_id) || 'Empreendimento'}
                      {link.is_project_default ? (
                        <span className="ml-2 text-[10px] text-[var(--color-success)]">padrão</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] text-amber-300"
                      onClick={() =>
                        void run(() => handleDetach(selected.id, link.project_id), 'Associação removida.')
                      }
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void run(() => handleRename(selected), 'Nome atualizado.')}
              className="h-9 px-3 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold"
            >
              Salvar nome
            </button>
            {!selected.is_company_default && selected.status === 'active' && (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void run(() => swapCompanyDefault(selected.id), 'Padrão da empresa atualizado.')
                }
                className="h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs"
              >
                Definir como padrão da empresa
              </button>
            )}
            <button type="button" className="h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs" onClick={() => setDialog({ type: 'view', modelId: selected.id })}>
              Visualizar
            </button>
            <button type="button" className="h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs" onClick={() => void run(() => handleDuplicate(selected), 'Modelo duplicado.')}>
              Duplicar
            </button>
            <button type="button" className="h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs" onClick={() => { setSaveAsName(`Cópia de ${selected.name}`); setDialog({ type: 'saveAs', modelId: selected.id }); }}>
              Salvar como novo
            </button>
            <button type="button" className="h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs" onClick={() => { setAssociateProjectId(projects[0]?.id || ''); setAssociateAsDefault(true); setDialog({ type: 'associate', modelId: selected.id }); }}>
              Associar a empreendimento
            </button>
            <button type="button" className="h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs" onClick={() => setDialog({ type: 'history', modelId: selected.id })}>
              Histórico
            </button>
            <button
              type="button"
              className="h-9 px-3 rounded-lg border border-[var(--color-border)] text-xs"
              onClick={() =>
                void run(
                  () => handleArchiveToggle(selected),
                  selected.status === 'archived' ? 'Modelo desarquivado.' : 'Modelo arquivado.',
                )
              }
            >
              {selected.status === 'archived' ? 'Desarquivar' : 'Arquivar'}
            </button>
          </div>
        </Modal>
      )}

      {dialog?.type === 'view' && selected && (
        <Modal title="Visualizar modelo" onClose={() => setDialog(null)} wide>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">
            Venda / lote para prévia
          </label>
          <select disabled className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] mb-4">
            <option>Em breve: escolher uma venda só para visualizar, sem gerar contrato</option>
          </select>
          {legalContentIsLocked(selected.catalog_code) ? (
            <p className="text-sm text-[var(--text-secondary)]">{LEGAL_TEXT_LOCKED}</p>
          ) : (
            <div
              className="rounded-lg border border-[var(--color-border)] bg-white text-gray-900 p-4 max-h-[50vh] overflow-auto text-sm"
              dangerouslySetInnerHTML={{
                __html:
                  versions.find((v) => v.model_id === selected.id && v.status === 'published')
                    ?.content_html || '<p>Nenhum conteúdo importado ainda.</p>',
              }}
            />
          )}
          {showsAutoEmissionPending(selected.catalog_code, selected.source) && (
            <p className="mt-3 text-xs text-amber-200">{CUSTOM_NOT_IN_AUTO_EMISSION}</p>
          )}
        </Modal>
      )}

      {dialog?.type === 'history' && selected && (
        <Modal title="Histórico de versões" onClose={() => setDialog(null)}>
          <ul className="space-y-2 text-sm">
            {versions
              .filter((v) => v.model_id === selected.id)
              .sort((a, b) => b.version - a.version)
              .map((row) => (
                <li key={row.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                  <div className="font-medium text-white">Versão {row.version}</div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {row.status === 'published' ? 'Publicada' : 'Rascunho'} · {fmtDate(row.created_at)}
                  </div>
                </li>
              ))}
            {versions.filter((v) => v.model_id === selected.id).length === 0 && (
              <li className="text-[var(--color-text-muted)]">Nenhuma versão registrada.</li>
            )}
          </ul>
        </Modal>
      )}

      {dialog?.type === 'associate' && selected && (
        <Modal title="Associar a empreendimento" onClose={() => setDialog(null)}>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Empreendimento</label>
          <select
            value={associateProjectId}
            onChange={(e) => setAssociateProjectId(e.target.value)}
            className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white mb-3"
          >
            <option value="">Selecione</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={associateAsDefault}
              onChange={(e) => setAssociateAsDefault(e.target.checked)}
            />
            Definir como padrão deste empreendimento
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void run(async () => {
                await handleAssociate(selected, associateProjectId, associateAsDefault);
                setDialog({ type: 'sheet', modelId: selected.id });
              }, 'Empreendimento associado.')
            }
            className="mt-4 h-9 px-3 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold"
          >
            Associar
          </button>
        </Modal>
      )}

      {dialog?.type === 'saveAs' && selected && (
        <Modal title="Salvar como novo" onClose={() => setDialog(null)}>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Nome do novo modelo</label>
          <input
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void run(async () => {
                await handleDuplicate(selected, saveAsName);
                setDialog(null);
              }, 'Novo modelo criado.')
            }
            className="mt-4 h-9 px-3 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold"
          >
            Salvar como novo
          </button>
        </Modal>
      )}

      {dialog?.type === 'new' && (
        <Modal title="Novo modelo" onClose={() => setDialog(null)}>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Nome do modelo</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white mb-3"
          />
          <p className="text-xs text-[var(--color-text-muted)] mb-2">Baseado em</p>
          <div className="flex gap-3 mb-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={newMode === 'existing'}
                onChange={() => setNewMode('existing')}
              />
              Modelo existente
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={newMode === 'custom'}
                onChange={() => setNewMode('custom')}
              />
              Personalizado
            </label>
          </div>
          {newMode === 'existing' ? (
            <select
              value={newBaseId}
              onChange={(e) => setNewBaseId(e.target.value)}
              className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white mb-3"
            >
              {models
                .filter((m) => m.status === 'active')
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          ) : (
            <p className="text-xs text-amber-200 mb-3">{CUSTOM_NOT_IN_AUTO_EMISSION}</p>
          )}
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">
            Associar a empreendimento (opcional)
          </label>
          <select
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white mb-3"
          >
            <option value="">Nenhum</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {newProjectId && (
            <label className="flex items-center gap-2 text-sm mb-3">
              <input
                type="checkbox"
                checked={newProjectDefault}
                onChange={(e) => setNewProjectDefault(e.target.checked)}
              />
              Padrão deste empreendimento
            </label>
          )}
          <label className="flex items-center gap-2 text-sm mb-4">
            <input
              type="checkbox"
              checked={newCompanyDefault}
              onChange={(e) => setNewCompanyDefault(e.target.checked)}
            />
            Definir como padrão da empresa
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void run(async () => {
                const name = newName.trim();
                if (!name) throw new Error('Informe o nome do modelo.');
                if (newMode === 'existing' && !newBaseId) throw new Error('Escolha um modelo de origem.');
                const base = models.find((m) => m.id === newBaseId);
                const catalogCode = newMode === 'custom' ? 'CUSTOM' : base?.catalog_code || 'CUSTOM';
                const engineKey =
                  newMode === 'custom'
                    ? 'custom'
                    : base?.engine_key || 'classic';
                const pub = base
                  ? versions
                      .filter((v) => v.model_id === base.id && v.status === 'published')
                      .sort((a, b) => b.version - a.version)[0]
                  : null;
                const id = await insertModel({
                  name,
                  catalogCode,
                  engineKey,
                  contentHtml: catalogCode === 'CUSTOM' ? pub?.content_html ?? null : null,
                  params: catalogCode === 'CUSTOM' ? pub?.engine_params_json ?? null : null,
                });
                if (newCompanyDefault) await swapCompanyDefault(id);
                if (newProjectId) {
                  const project = projects.find((p) => p.id === newProjectId);
                  if (project) {
                    await handleAssociate(
                      {
                        id,
                        company_id: tenantId || '',
                        catalog_code: catalogCode,
                        engine_key: engineKey,
                        name,
                        status: 'active',
                        source: 'user',
                        is_company_default: false,
                        created_at: null,
                        updated_at: null,
                      },
                      project.id,
                      newProjectDefault,
                    );
                  }
                }
                setDialog(null);
              }, 'Modelo criado.')
            }
            className="h-9 px-3 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold"
          >
            Criar modelo
          </button>
        </Modal>
      )}

      {dialog?.type === 'import' && (
        <Modal title="Importar contrato" onClose={() => setDialog(null)}>
          <p className="text-xs text-amber-200 mb-3">{CUSTOM_NOT_IN_AUTO_EMISSION}</p>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Nome do modelo</label>
          <input
            value={importName}
            onChange={(e) => setImportName(e.target.value)}
            className="w-full h-9 px-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white mb-3"
          />
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">Arquivo (opcional)</label>
          <input
            type="file"
            accept=".html,.htm,.txt,.pdf,.doc,.docx"
            className="block w-full text-xs text-[var(--text-secondary)] mb-3"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setImportFile(file ? { name: file.name, mime: file.type || 'application/octet-stream' } : null);
            }}
          />
          <p className="text-[11px] text-[var(--color-text-muted)] mb-3">
            O arquivo fica guardado como material deste modelo. A conversão automática para contrato
            operacional será feita em uma etapa posterior.
          </p>
          <label className="block text-xs text-[var(--color-text-muted)] mb-1">
            Texto HTML (opcional)
          </label>
          <textarea
            value={importHtml}
            onChange={(e) => setImportHtml(e.target.value)}
            rows={5}
            className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-white text-xs mb-4"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void run(async () => {
                const name = importName.trim();
                if (!name) throw new Error('Informe o nome do modelo.');
                await insertModel({
                  name,
                  catalogCode: 'CUSTOM',
                  engineKey: 'custom',
                  contentHtml: importHtml.trim() || null,
                  params: {
                    import: {
                      fileName: importFile?.name || null,
                      mime: importFile?.mime || null,
                      conversion: 'pending',
                    },
                  },
                });
                setDialog(null);
              }, 'Contrato importado como modelo personalizado.')
            }
            className="h-9 px-3 rounded-lg bg-[var(--color-primary)] text-white text-xs font-semibold"
          >
            Importar
          </button>
        </Modal>
      )}
    </div>
  );
}

function ActionItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--color-surface)] hover:text-white"
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={`bg-[var(--color-background)] text-[var(--text-primary)] rounded-xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} shadow-2xl border border-[var(--color-border)] max-h-[90vh] overflow-auto`}
      >
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="font-bold text-base">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-[var(--color-surface)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

