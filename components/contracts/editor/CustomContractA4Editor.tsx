'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { Editor } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Eye,
  History,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Redo2,
  Save,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useSessionGuard } from '@/hooks/useSessionGuard';
import { resolveActiveTenantId } from '@/lib/activeTenant';
import { isPartnerPanelAdmin } from '@/lib/partnerPanelAdmin';
import { CONTRACT_MODELS_CENTRAL_PATH } from '@/lib/contractModelCentral';
import {
  ASSOCIATION_ALREADY_EXISTS,
  associationWriteError,
  payloadForCentralTable,
} from '@/lib/contractModelCentralOps';
import {
  CUSTOM_CONTRACT_EDITOR_PATH,
  CUSTOM_EDITOR_ONLY,
  NO_CHANGE_SINCE_PUBLISHED,
  canOpenCustomA4Editor,
  canPublishCustomDraft,
  defaultCustomDraftHtml,
  shouldAutosavePublish,
} from '@/lib/customContractModelEditor';
import {
  highlightCustomPlaceholdersForPreview,
  fillCustomPlaceholdersForPreview,
  sanitizeImportedContractHtml,
  countVisualA4Pages,
} from '@/lib/customContractHtml';
import {
  CUSTOM_PLACEHOLDER_GROUPS,
  CUSTOM_PLACEHOLDERS,
  placeholdersByGroup,
  type CustomPlaceholderGroupId,
} from '@/lib/customContractPlaceholders';
import { resolveCustomPreviewValues } from '@/lib/customContractPreviewResolver';
import {
  listSalesForCustomPreview,
  loadCustomPreviewContext,
  type PreviewSaleOption,
} from '@/lib/customContractPreviewLoad';
import ManageContractModelProjectsPanel, {
  type ManageProjectLink,
} from '@/components/contracts/central/ManageContractModelProjectsPanel';
import CustomA4PaginatedHtml from '@/components/contracts/editor/CustomA4PaginatedHtml';
import { printCustomContractPreview } from '@/lib/customContractPrint';
import type { CompanyLogoAlign } from '@/lib/customContractLogo';
import {
  REBUILD_ESTRELA_CUSTOM_CONFIRM,
  REBUILD_ESTRELA_CUSTOM_LABEL,
  canRebuildEstrelaConvertedCustom,
  renderEngineModelAsCustomHtml,
} from '@/lib/engineModelToCustom';
import '@/components/contracts/editor/customContractEditor.css';

const CustomContractTiptap = dynamic(
  () => import('@/components/contracts/editor/CustomContractTiptap'),
  { ssr: false, loading: () => <p className="text-sm text-gray-500">Carregando editor…</p> },
);

type ModelRow = {
  id: string;
  company_id: string;
  catalog_code: string;
  engine_key: string;
  name: string;
  status: string;
};

type VersionRow = {
  id: string;
  model_id: string;
  company_id: string;
  version: number;
  status: 'draft' | 'published' | string;
  content_html: string | null;
  engine_params_json: Record<string, unknown> | null;
  created_at: string | null;
  updated_at?: string | null;
  published_at?: string | null;
};

type LinkRow = {
  id: string;
  company_contract_model_id: string;
  project_id: string;
  company_id: string;
  is_project_default: boolean;
};
type ProjectOpt = { id: string; name: string; companyId: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Panel = 'preview' | 'history' | 'manage' | 'saveAs' | 'rebuildEstrela' | null;

function firstRpcRow<T>(data: T | T[] | null | undefined): T | null {
  if (!data) return null;
  return Array.isArray(data) ? data[0] || null : data;
}

function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function footnoteBodyText(editor: Editor | null, noteId: string): string {
  if (!editor || !noteId) return '';
  let text = '';
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'footnoteDefinition' && String(node.attrs.noteId) === noteId) {
      text = node.textContent;
      return false;
    }
    return true;
  });
  return text;
}

export default function CustomContractA4Editor() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const modelId = String(params?.id || '');
  const { user, loading: authLoading } = useSessionGuard();
  const canOperate = isPartnerPanelAdmin(user?.role);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [model, setModel] = useState<ModelRow | null>(null);
  const [name, setName] = useState('');
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [html, setHtml] = useState('');
  const [initialHtml, setInitialHtml] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [publishing, setPublishing] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [saveAsName, setSaveAsName] = useState('');
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [linkSaving, setLinkSaving] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    company: true,
    buyer: true,
  });
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewFilled, setPreviewFilled] = useState<string | null>(null);
  const [previewSales, setPreviewSales] = useState<PreviewSaleOption[]>([]);
  const [previewSaleId, setPreviewSaleId] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [toolbarTick, setToolbarTick] = useState(0);
  const [contentKey, setContentKey] = useState('');
  const [replaceKey, setReplaceKey] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [visualPageCount, setVisualPageCount] = useState(1);
  const [editingNoteId, setEditingNoteId] = useState('');
  const [fromEstrela, setFromEstrela] = useState(false);

  const editorRef = useRef<Editor | null>(null);
  const htmlRef = useRef('');
  const lastSavedRef = useRef('');
  const draftIdRef = useRef<string | null>(null);
  const tenantRef = useRef<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewPrintRef = useRef<HTMLDivElement | null>(null);

  const lastPublished = useMemo(() => {
    return (
      versions
        .filter((row) => row.status === 'published')
        .sort((a, b) => b.version - a.version)[0] || null
    );
  }, [versions]);

  const publishGate = canPublishCustomDraft(html, lastPublished?.content_html);
  const canPublish = publishGate.ok && canOperate && !publishing && !loading;

  const persistDraft = useCallback(async (content: string) => {
    const id = draftIdRef.current;
    const companyId = tenantRef.current;
    if (!id || !companyId) return;
    if (shouldAutosavePublish()) {
      throw new Error('Autosave não pode publicar.');
    }
    // Salvar o draft não recarrega/hidrata o editor — o conteúdo local já é a versão atual.
    setSaveState('saving');
    const payload = payloadForCentralTable('company_contract_model_versions', {
      content_html: content,
      updated_at: new Date().toISOString(),
    });
    if ('tenant_id' in payload) {
      throw new Error('Versão de modelo não usa tenant_id.');
    }
    const { error: updateError } = await supabase
      .from('company_contract_model_versions')
      .update(payload)
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('status', 'draft')
      .eq('version', 0);
    if (updateError) throw new Error(updateError.message);
    lastSavedRef.current = content;
    setSaveState('saved');
  }, []);

  const scheduleAutosave = useCallback(
    (content: string) => {
      htmlRef.current = content;
      setHtml(content);
      setToolbarTick((n) => n + 1);
      if (content === lastSavedRef.current) return;
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        void persistDraft(htmlRef.current).catch((e) => {
          setSaveState('error');
          setError(e instanceof Error ? e.message : 'Falha ao salvar o rascunho.');
        });
      }, 1400);
    },
    [persistDraft],
  );

  const load = useCallback(async () => {
    if (!user || !modelId) return;
    setLoading(true);
    setError(null);
    const activeTenantId = await resolveActiveTenantId(user);
    if (!activeTenantId) {
      setError('Empresa não identificada.');
      setLoading(false);
      return;
    }
    tenantRef.current = activeTenantId;

    const { data: modelRow, error: modelError } = await supabase
      .from('company_contract_models')
      .select('id, company_id, catalog_code, engine_key, name, status')
      .eq('id', modelId)
      .eq('company_id', activeTenantId)
      .maybeSingle();
    if (modelError || !modelRow) {
      setError(modelError?.message || 'Modelo não encontrado.');
      setLoading(false);
      return;
    }
    if (!canOpenCustomA4Editor(String(modelRow.catalog_code))) {
      setError(CUSTOM_EDITOR_ONLY);
      setLoading(false);
      router.replace(CONTRACT_MODELS_CENTRAL_PATH);
      return;
    }
    setModel(modelRow as ModelRow);
    setName(String(modelRow.name || ''));

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'ensure_company_contract_model_draft',
      { p_model_id: modelId },
    );
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    const ensured = firstRpcRow(rpcData as VersionRow | VersionRow[]);
    if (!ensured?.id) {
      setError('Não foi possível abrir o rascunho.');
      setLoading(false);
      return;
    }

    const { data: versionRows, error: versionError } = await supabase
      .from('company_contract_model_versions')
      .select(
        'id, model_id, company_id, version, status, content_html, engine_params_json, created_at, updated_at, published_at',
      )
      .eq('model_id', modelId)
      .eq('company_id', activeTenantId)
      .order('version', { ascending: false });
    if (versionError) {
      setError(versionError.message);
      setLoading(false);
      return;
    }
    const scoped = ((versionRows ?? []) as VersionRow[]).filter(
      (row) => String(row.company_id) === String(activeTenantId),
    );
    setVersions(scoped);
    const draftRow =
      scoped.find((row) => row.status === 'draft' && row.version === 0) || ensured;
    const raw = String(draftRow.content_html ?? ensured.content_html ?? '');
    const content = raw.trim() ? raw : defaultCustomDraftHtml(null);
    const alreadyOpen =
      Boolean(editorRef.current) && draftIdRef.current === draftRow.id && Boolean(htmlRef.current);
    draftIdRef.current = draftRow.id;
    if (!alreadyOpen) {
      setContentKey(
        `${draftRow.id}:${String(draftRow.updated_at || draftRow.created_at || '')}:${content.length}`,
      );
      setInitialHtml(content);
      setHtml(content);
      htmlRef.current = content;
      lastSavedRef.current = content;
    }
    const importMeta = (draftRow.engine_params_json || ensured.engine_params_json || {}) as {
      import?: { warnings?: string[]; conversion?: string };
    };
    setFromEstrela(
      canRebuildEstrelaConvertedCustom({
        catalog_code: String(modelRow.catalog_code),
        versions: scoped,
      }),
    );
    if (importMeta.import?.warnings?.length) {
      setNotice(
        `Documento importado (${importMeta.import.conversion || 'arquivo'}). Conferir: ${importMeta.import.warnings
          .slice(0, 4)
          .join(' ')}`,
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
    setProjects(scopedProjects);
    const { data: linkRows } = await supabase
      .from('project_contract_model_links')
      .select('id, company_contract_model_id, project_id, company_id, is_project_default')
      .eq('company_id', activeTenantId)
      .eq('company_contract_model_id', modelId);
    setLinks(
      ((linkRows ?? []) as LinkRow[]).filter((row) => String(row.company_id) === String(activeTenantId)),
    );
    const { data: companyRow } = await supabase
      .from('companies')
      .select('logo_url')
      .eq('id', activeTenantId)
      .maybeSingle();
    setCompanyLogoUrl(String(companyRow?.logo_url || '').trim() || null);
    setLoading(false);
  }, [user, modelId, router]);

  const handleEditor = useCallback((current: Editor | null) => {
    editorRef.current = current;
  }, []);

  const handlePageCount = useCallback((count: number) => {
    setVisualPageCount((prev) => (prev === count ? prev : count));
  }, []);

  const handleSelection = useCallback(() => {
    const current = editorRef.current;
    setToolbarTick((n) => n + 1);
    if (current?.isActive('footnoteReference')) {
      setEditingNoteId(String(current.getAttributes('footnoteReference').noteId || ''));
    } else if (
      typeof document !== 'undefined' &&
      !(document.activeElement as HTMLElement | null)?.closest('[data-footnote-editor]')
    ) {
      setEditingNoteId('');
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load]);

  useEffect(() => {
    if (search?.get('preview') === '1' && !loading && initialHtml) {
      setPreviewHtml(htmlRef.current);
      setPanel('preview');
    }
  }, [search, loading, initialHtml]);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  async function saveNameIfNeeded() {
    const companyId = tenantRef.current;
    if (!model || !companyId) return;
    const next = name.trim();
    if (!next || next === model.name) return;
    const { error: updateError } = await supabase
      .from('company_contract_models')
      .update({ name: next, updated_at: new Date().toISOString() })
      .eq('id', model.id)
      .eq('company_id', companyId);
    if (updateError) throw new Error(updateError.message);
    setModel({ ...model, name: next });
  }

  async function handleSaveDraft() {
    try {
      setError(null);
      await saveNameIfNeeded();
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      await persistDraft(htmlRef.current);
      setNotice('Rascunho salvo.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o rascunho.');
    }
  }

  async function handleRebuildEstrelaOfficial() {
    const html = renderEngineModelAsCustomHtml('ESTRELA_DO_SUL');
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    htmlRef.current = html;
    setHtml(html);
    setInitialHtml(html);
    setContentKey(`rebuild-estrela:${Date.now()}:${html.length}`);
    await persistDraft(html);
    setPanel(null);
    setNotice('Rascunho reconstruído com o contrato oficial ESTRELA_DO_SUL e campos dinâmicos.');
  }

  async function handlePublish() {
    if (!canPublish || !modelId) return;
    setPublishing(true);
    setError(null);
    try {
      await saveNameIfNeeded();
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      await persistDraft(htmlRef.current);
      const gate = canPublishCustomDraft(htmlRef.current, lastPublished?.content_html);
      if (!gate.ok) {
        setError(gate.reason || NO_CHANGE_SINCE_PUBLISHED);
        return;
      }
      const { data, error: rpcError } = await supabase.rpc(
        'publish_company_contract_model_version',
        { p_model_id: modelId },
      );
      if (rpcError) throw new Error(rpcError.message);
      const published = firstRpcRow(data as VersionRow | VersionRow[]);
      if (!published?.id) throw new Error('A publicação não retornou a nova versão.');
      setNotice(`Versão v${published.version} publicada.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível publicar a versão.');
    } finally {
      setPublishing(false);
    }
  }

  async function handleSaveAsNew() {
    const companyId = tenantRef.current;
    const nextName = saveAsName.trim();
    if (!nextName || !companyId) return;
    const payload = payloadForCentralTable('company_contract_models', {
      company_id: companyId,
      tenant_id: companyId,
      catalog_code: 'CUSTOM',
      engine_key: 'custom',
      name: nextName,
      status: 'active',
      source: 'user',
      is_company_default: false,
    });
    const { data, error: insertError } = await supabase
      .from('company_contract_models')
      .insert(payload)
      .select('id')
      .single();
    if (insertError || !data?.id) {
      throw new Error(insertError?.message || 'Não foi possível criar o modelo.');
    }
    const versionPayload = payloadForCentralTable('company_contract_model_versions', {
      model_id: data.id,
      company_id: companyId,
      version: 0,
      status: 'draft',
      content_html: htmlRef.current,
      engine_params_json: null,
      updated_at: new Date().toISOString(),
    });
    const { error: versionError } = await supabase
      .from('company_contract_model_versions')
      .insert(versionPayload);
    if (versionError) throw new Error(versionError.message);
    router.push(CUSTOM_CONTRACT_EDITOR_PATH(String(data.id)));
  }

  async function reloadLinks() {
    const companyId = tenantRef.current;
    if (!companyId || !modelId) return;
    const { data: linkRows } = await supabase
      .from('project_contract_model_links')
      .select('id, company_contract_model_id, project_id, company_id, is_project_default')
      .eq('company_id', companyId)
      .eq('company_contract_model_id', modelId);
    setLinks(
      ((linkRows ?? []) as LinkRow[]).filter((row) => String(row.company_id) === String(companyId)),
    );
  }

  async function runLinkAction(action: () => Promise<void>, okMessage: string): Promise<boolean> {
    setLinkSaving(true);
    setError(null);
    try {
      await action();
      await reloadLinks();
      setNotice(okMessage);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar a associação.');
      return false;
    } finally {
      setLinkSaving(false);
    }
  }

  async function handleAssociateProject(projectId: string, asDefault: boolean) {
    const companyId = tenantRef.current;
    if (!companyId || !model) throw new Error('Empresa não identificada.');
    const project = projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Escolha um empreendimento.');
    if (links.some((l) => l.project_id === project.id)) {
      throw new Error(ASSOCIATION_ALREADY_EXISTS);
    }
    const linkPayload = payloadForCentralTable('project_contract_model_links', {
      project_id: project.id,
      company_id: companyId,
      company_contract_model_id: model.id,
      is_project_default: false,
    });
    const { data, error: insertError } = await supabase
      .from('project_contract_model_links')
      .insert(linkPayload)
      .select('id')
      .single();
    if (insertError || !data?.id) {
      throw new Error(associationWriteError(insertError?.message || 'Não foi possível associar.'));
    }
    if (asDefault) await handleSetProjectDefault(String(data.id), project.id);
  }

  async function handleSetProjectDefault(linkId: string, projectId: string) {
    const companyId = tenantRef.current;
    if (!companyId) throw new Error('Empresa não identificada.');
    const { error: unsetError } = await supabase
      .from('project_contract_model_links')
      .update({ is_project_default: false })
      .eq('project_id', projectId)
      .eq('company_id', companyId)
      .eq('is_project_default', true);
    if (unsetError) throw new Error(unsetError.message);
    const { error: setError } = await supabase
      .from('project_contract_model_links')
      .update({ is_project_default: true })
      .eq('id', linkId)
      .eq('company_id', companyId)
      .eq('project_id', projectId);
    if (setError) throw new Error(setError.message);
  }

  async function handleDetachLink(link: ManageProjectLink) {
    const companyId = tenantRef.current;
    if (!companyId || !model) throw new Error('Empresa não identificada.');
    const { error: deleteError } = await supabase
      .from('project_contract_model_links')
      .delete()
      .eq('id', link.id)
      .eq('company_id', companyId)
      .eq('company_contract_model_id', model.id)
      .eq('project_id', link.projectId);
    if (deleteError) throw new Error(deleteError.message);
  }

  function insertField(key: string) {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.state.selection.empty) {
      editor.chain().focus().replaceSelectionWithPlaceholder(key).run();
      return;
    }
    editor.chain().focus().insertContractPlaceholder(key).run();
  }

  function applyAlign(align: CompanyLogoAlign | 'justify') {
    const current = editorRef.current;
    if (!current) return;
    if (current.isActive('companyLogo') && align !== 'justify') {
      current.chain().focus().updateCompanyLogoLayout({ align }).run();
      setToolbarTick((n) => n + 1);
      return;
    }
    current.chain().focus().setTextAlign(align).run();
    setToolbarTick((n) => n + 1);
  }

  async function openPreview() {
    setPreviewHtml(htmlRef.current);
    setPreviewFilled(null);
    setPreviewSaleId('');
    setPanel('preview');
    const tenantId = tenantRef.current;
    if (!tenantId) return;
    setPreviewLoading(true);
    try {
      const sales = await listSalesForCustomPreview(supabase, tenantId);
      setPreviewSales(sales);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível listar vendas para prévia.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function applyPreviewSale(saleId: string) {
    setPreviewSaleId(saleId);
    const tenantId = tenantRef.current;
    if (!saleId || !tenantId) {
      setPreviewFilled(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const ctx = await loadCustomPreviewContext(supabase, tenantId, saleId);
      const values = resolveCustomPreviewValues(ctx);
      setPreviewFilled(fillCustomPlaceholdersForPreview(htmlRef.current, values));
    } catch (e) {
      setPreviewFilled(null);
      setError(e instanceof Error ? e.message : 'Não foi possível montar a prévia.');
    } finally {
      setPreviewLoading(false);
    }
  }

  function toolbarBtn(label: string, onClick: () => void, active?: boolean, icon?: ReactNode) {
    return (
      <button
        type="button"
        title={label}
        onClick={onClick}
        className={`h-8 min-w-8 px-2 rounded-md text-xs border ${
          active
            ? 'bg-white text-gray-900 border-white'
            : 'border-white/15 text-gray-200 hover:bg-white/10'
        }`}
      >
        {icon || label}
      </button>
    );
  }

  if (authLoading || loading) {
    return (
      <div className="sv-page flex h-full items-center justify-center text-[var(--color-text-muted)]">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Abrindo editor A4…
      </div>
    );
  }

  if (!model) {
    return (
      <div className="sv-page p-6 text-sm text-amber-200">
        {error || CUSTOM_EDITOR_ONLY}
        <div className="mt-3">
          <a href={CONTRACT_MODELS_CENTRAL_PATH} className="text-sky-300 underline">
            Voltar à Central
          </a>
        </div>
      </div>
    );
  }

  const editor = editorRef.current;
  void toolbarTick;

  return (
    <div className="sv-page sv-a4-editor flex h-full min-w-0 flex-col bg-[#1b1d22] text-white overflow-hidden">
      <header className="shrink-0 border-b border-white/10 bg-[#12141a] px-3 py-2 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={CONTRACT_MODELS_CENTRAL_PATH}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-white/10 text-gray-400"
            title="Central de modelos"
          >
            <ArrowLeft className="w-4 h-4" />
          </a>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              void saveNameIfNeeded().catch((e) =>
                setError(e instanceof Error ? e.message : 'Não foi possível salvar o nome.'),
              )
            }
            className="h-8 min-w-[220px] flex-1 max-w-md px-3 rounded-lg bg-white/5 border border-white/10 text-sm font-semibold"
          />
          <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/30">
            Rascunho
            {lastPublished ? ` · última publicada v${lastPublished.version}` : ''}
          </span>
          <span className="text-[11px] text-gray-400 min-w-[120px]">
            {saveState === 'saving'
              ? 'Salvando…'
              : saveState === 'saved'
                ? 'Rascunho salvo'
                : saveState === 'error'
                  ? 'Erro ao salvar'
                  : ' '}
          </span>
          <button
            type="button"
            disabled={!canOperate}
            onClick={() => void handleSaveDraft()}
            className="h-8 px-3 rounded-lg bg-white/10 text-xs font-semibold inline-flex items-center gap-1"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar rascunho
          </button>
          {fromEstrela && (
            <button
              type="button"
              disabled={!canOperate}
              onClick={() => setPanel('rebuildEstrela')}
              className="h-8 px-3 rounded-lg border border-sky-500/40 text-xs text-sky-100"
            >
              {REBUILD_ESTRELA_CUSTOM_LABEL}
            </button>
          )}
          <button
            type="button"
            disabled={!canPublish}
            title={publishGate.reason || 'Publicar versão'}
            onClick={() => void handlePublish()}
            className="h-8 px-3 rounded-lg bg-[var(--color-primary)] text-xs font-semibold disabled:opacity-40"
          >
            {publishing ? 'Publicando…' : 'Publicar versão'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSaveAsName(`Cópia de ${name}`);
              setPanel('saveAs');
            }}
            className="h-8 px-3 rounded-lg border border-white/10 text-xs"
          >
            Salvar como novo
          </button>
          <button
            type="button"
            onClick={() => void openPreview()}
            className="h-8 px-3 rounded-lg border border-white/10 text-xs inline-flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            Visualizar
          </button>
          <button
            type="button"
            onClick={() => setPanel('history')}
            className="h-8 px-3 rounded-lg border border-white/10 text-xs inline-flex items-center gap-1"
          >
            <History className="w-3.5 h-3.5" />
            Histórico
          </button>
          <button
            type="button"
            onClick={() => setPanel('manage')}
            className="h-8 px-3 rounded-lg border border-white/10 text-xs"
          >
            Gerenciar empreendimentos
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {toolbarBtn('Desfazer', () => editor?.chain().focus().undo().run(), false, <Undo2 className="w-3.5 h-3.5" />)}
          {toolbarBtn('Refazer', () => editor?.chain().focus().redo().run(), false, <Redo2 className="w-3.5 h-3.5" />)}
          {toolbarBtn('Negrito', () => editor?.chain().focus().toggleBold().run(), editor?.isActive('bold'), <Bold className="w-3.5 h-3.5" />)}
          {toolbarBtn('Itálico', () => editor?.chain().focus().toggleItalic().run(), editor?.isActive('italic'), <Italic className="w-3.5 h-3.5" />)}
          {toolbarBtn(
            'Sublinhado',
            () => editor?.chain().focus().toggleUnderline().run(),
            editor?.isActive('underline'),
            <UnderlineIcon className="w-3.5 h-3.5" />,
          )}
          {toolbarBtn('Título 1', () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), editor?.isActive('heading', { level: 1 }), 'H1')}
          {toolbarBtn('Título 2', () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), editor?.isActive('heading', { level: 2 }), 'H2')}
          {toolbarBtn('Título 3', () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), editor?.isActive('heading', { level: 3 }), 'H3')}
          <select
            className="h-8 rounded-md bg-[#1b1d22] border border-white/15 text-xs px-2"
            defaultValue=""
            onChange={(e) => {
              const value = e.target.value;
              if (!value) editor?.chain().focus().unsetFontSize().run();
              else editor?.chain().focus().setFontSize(value).run();
            }}
          >
            <option value="">Tamanho</option>
            <option value="10pt">10</option>
            <option value="12pt">12</option>
            <option value="14pt">14</option>
            <option value="16pt">16</option>
            <option value="18pt">18</option>
            <option value="22pt">22</option>
          </select>
          {toolbarBtn('Esquerda', () => applyAlign('left'), editor?.isActive({ textAlign: 'left' }) || (editor?.isActive('companyLogo') && editor?.getAttributes('companyLogo')?.align === 'left'), <AlignLeft className="w-3.5 h-3.5" />)}
          {toolbarBtn('Centro', () => applyAlign('center'), editor?.isActive({ textAlign: 'center' }) || (editor?.isActive('companyLogo') && editor?.getAttributes('companyLogo')?.align === 'center'), <AlignCenter className="w-3.5 h-3.5" />)}
          {toolbarBtn('Direita', () => applyAlign('right'), editor?.isActive({ textAlign: 'right' }) || (editor?.isActive('companyLogo') && editor?.getAttributes('companyLogo')?.align === 'right'), <AlignRight className="w-3.5 h-3.5" />)}
          {toolbarBtn('Justificado', () => applyAlign('justify'), editor?.isActive({ textAlign: 'justify' }), <AlignJustify className="w-3.5 h-3.5" />)}
          <select
            className="h-8 rounded-md bg-[#1b1d22] border border-white/15 text-xs px-2"
            title="Espaçamento entre linhas"
            value={String(editor?.getAttributes('paragraph').lineHeight || editor?.getAttributes('heading').lineHeight || '')}
            onChange={(e) => {
              const value = e.target.value || null;
              editor?.chain().focus().setParagraphLayout({ lineHeight: value }).run();
              setToolbarTick((n) => n + 1);
            }}
          >
            <option value="">Entrelinha</option>
            <option value="1.15">1.15</option>
            <option value="1.45">1.45</option>
            <option value="1.6">1.6</option>
            <option value="2">2.0</option>
          </select>
          <select
            className="h-8 rounded-md bg-[#1b1d22] border border-white/15 text-xs px-2"
            title="Espaço antes do parágrafo"
            value={String(editor?.getAttributes('paragraph').marginTop || '')}
            onChange={(e) => {
              editor?.chain().focus().setParagraphLayout({ marginTop: e.target.value || null }).run();
              setToolbarTick((n) => n + 1);
            }}
          >
            <option value="">Antes</option>
            <option value="0">0</option>
            <option value="6px">6px</option>
            <option value="12px">12px</option>
            <option value="18px">18px</option>
          </select>
          <select
            className="h-8 rounded-md bg-[#1b1d22] border border-white/15 text-xs px-2"
            title="Espaço depois do parágrafo"
            value={String(editor?.getAttributes('paragraph').marginBottom || '')}
            onChange={(e) => {
              editor?.chain().focus().setParagraphLayout({ marginBottom: e.target.value || null }).run();
              setToolbarTick((n) => n + 1);
            }}
          >
            <option value="">Depois</option>
            <option value="0">0</option>
            <option value="6px">6px</option>
            <option value="10px">10px</option>
            <option value="18px">18px</option>
          </select>
          <select
            className="h-8 rounded-md bg-[#1b1d22] border border-white/15 text-xs px-2"
            title="Recuo esquerdo"
            value={String(editor?.getAttributes('paragraph').marginLeft || '')}
            onChange={(e) => {
              editor?.chain().focus().setParagraphLayout({ marginLeft: e.target.value || null }).run();
              setToolbarTick((n) => n + 1);
            }}
          >
            <option value="">Recuo</option>
            <option value="0">0</option>
            <option value="12px">12px</option>
            <option value="24px">24px</option>
            <option value="36px">36px</option>
          </select>
          <select
            className="h-8 rounded-md bg-[#1b1d22] border border-white/15 text-xs px-2"
            title="Recuo direito"
            value={String(editor?.getAttributes('paragraph').marginRight || '')}
            onChange={(e) => {
              editor?.chain().focus().setParagraphLayout({ marginRight: e.target.value || null }).run();
              setToolbarTick((n) => n + 1);
            }}
          >
            <option value="">Recuo dir.</option>
            <option value="0">0</option>
            <option value="12px">12px</option>
            <option value="24px">24px</option>
            <option value="36px">36px</option>
          </select>
          <select
            className="h-8 rounded-md bg-[#1b1d22] border border-white/15 text-xs px-2"
            title="Recuo da primeira linha"
            value={String(editor?.getAttributes('paragraph').textIndent || '')}
            onChange={(e) => {
              editor?.chain().focus().setParagraphLayout({ textIndent: e.target.value || null }).run();
              setToolbarTick((n) => n + 1);
            }}
          >
            <option value="">1ª linha</option>
            <option value="0">0</option>
            <option value="12px">12px</option>
            <option value="24px">24px</option>
            <option value="36px">36px</option>
          </select>
          {toolbarBtn('Lista', () => editor?.chain().focus().toggleBulletList().run(), editor?.isActive('bulletList'), <List className="w-3.5 h-3.5" />)}
          {toolbarBtn('Numerada', () => editor?.chain().focus().toggleOrderedList().run(), editor?.isActive('orderedList'), <ListOrdered className="w-3.5 h-3.5" />)}
          {toolbarBtn('Quebra de página', () => editor?.chain().focus().insertPageBreak().run(), false, 'Página')}
          {editor?.isActive('pageBreak') && (
            toolbarBtn('Remover quebra de página', () => editor.chain().focus().deletePageBreak().run())
          )}
          {toolbarBtn(
            'Inserir tabela',
            () => editor?.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: false }).run(),
            false,
            'Tabela',
          )}
          {editor?.isActive('table') && (
            <span className="sv-table-layout-bar">
              {toolbarBtn('Inserir linha acima', () => editor.chain().focus().addRowBefore().run())}
              {toolbarBtn('Inserir linha abaixo', () => editor.chain().focus().addRowAfter().run())}
              {toolbarBtn('Excluir linha', () => editor.chain().focus().deleteRow().run())}
              {toolbarBtn('Inserir coluna à esquerda', () => editor.chain().focus().addColumnBefore().run())}
              {toolbarBtn('Inserir coluna à direita', () => editor.chain().focus().addColumnAfter().run())}
              {toolbarBtn('Excluir coluna', () => editor.chain().focus().deleteColumn().run())}
              {toolbarBtn('Mesclar células', () => editor.chain().focus().mergeCells().run())}
              {toolbarBtn('Dividir célula', () => editor.chain().focus().splitCell().run())}
              {toolbarBtn('Texto à esquerda', () => editor.chain().focus().setTextAlign('left').run())}
              {toolbarBtn('Texto ao centro', () => editor.chain().focus().setTextAlign('center').run())}
              {toolbarBtn('Texto à direita', () => editor.chain().focus().setTextAlign('right').run())}
              {toolbarBtn('Texto justificado', () => editor.chain().focus().setTextAlign('justify').run())}
              {toolbarBtn(
                'Alinhar no topo',
                () => editor.chain().focus().setCellAttribute('verticalAlign', 'top').run(),
                editor.getAttributes('tableCell').verticalAlign === 'top' ||
                  editor.getAttributes('tableHeader').verticalAlign === 'top',
              )}
              {toolbarBtn(
                'Alinhar ao meio',
                () => editor.chain().focus().setCellAttribute('verticalAlign', 'middle').run(),
                editor.getAttributes('tableCell').verticalAlign === 'middle' ||
                  editor.getAttributes('tableHeader').verticalAlign === 'middle',
              )}
              {toolbarBtn(
                'Alinhar embaixo',
                () => editor.chain().focus().setCellAttribute('verticalAlign', 'bottom').run(),
                editor.getAttributes('tableCell').verticalAlign === 'bottom' ||
                  editor.getAttributes('tableHeader').verticalAlign === 'bottom',
              )}
              {toolbarBtn(
                'Bordas normais',
                () => editor.chain().focus().updateAttributes('table', { borders: 'normal' }).run(),
                editor.getAttributes('table').borders !== 'none',
              )}
              {toolbarBtn(
                'Sem bordas',
                () => editor.chain().focus().updateAttributes('table', { borders: 'none' }).run(),
                editor.getAttributes('table').borders === 'none',
              )}
              {toolbarBtn('Excluir tabela', () => editor.chain().focus().deleteTable().run())}
              <label className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                Altura mín.
                <input
                  type="number"
                  min={0}
                  className="h-7 w-16 rounded-md bg-[#1b1d22] border border-white/15 text-xs px-1"
                  value={String(editor.getAttributes('tableCell').minHeight || editor.getAttributes('tableHeader').minHeight || '').replace('px', '')}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const value = raw ? `${raw}px` : null;
                    editor.chain().focus().setCellAttribute('minHeight', value).run();
                    setToolbarTick((n) => n + 1);
                  }}
                />
              </label>
            </span>
          )}
          {(editor?.isActive('footnoteReference') || editingNoteId) && (
            <span className="sv-fn-layout-bar">
              <span>Nota {editingNoteId || String(editor?.getAttributes('footnoteReference').noteId || '')}</span>
              <div
                key={editingNoteId}
                className="sv-fn-edit"
                contentEditable
                suppressContentEditableWarning
                data-footnote-editor="true"
                onBlur={(e) => {
                  const noteId = editingNoteId || String(editor?.getAttributes('footnoteReference').noteId || '');
                  if (!noteId || !editor) return;
                  editor.chain().focus().updateFootnoteBody(noteId, e.currentTarget.innerText || '').run();
                }}
              >
                {footnoteBodyText(
                  editor,
                  editingNoteId || String(editor?.getAttributes('footnoteReference').noteId || ''),
                )}
              </div>
              {toolbarBtn('Remover referência', () => editor?.chain().focus().removeFootnoteReference().run())}
              {toolbarBtn(
                'Remover nota',
                () => {
                  const noteId = editingNoteId || String(editor?.getAttributes('footnoteReference').noteId || '');
                  editor?.chain().focus().removeFootnoteNote(noteId).run();
                  setEditingNoteId('');
                },
              )}
            </span>
          )}
          {editor?.isActive('companyLogo') && (
            <span className="sv-logo-layout-bar">
              <label className="inline-flex items-center gap-1">
                Largura
                <input
                  type="range"
                  min={64}
                  max={360}
                  value={Number(editor.getAttributes('companyLogo').width || 180)}
                  onChange={(e) => {
                    editor.chain().focus().updateCompanyLogoLayout({ width: Number(e.target.value) }).run();
                    setToolbarTick((n) => n + 1);
                  }}
                />
                <span>{Number(editor.getAttributes('companyLogo').width || 180)}px</span>
              </label>
              <label className="inline-flex items-center gap-1">
                Antes
                <input
                  type="number"
                  min={0}
                  max={96}
                  className="w-14 h-7 rounded bg-[#1b1d22] border border-white/15 px-1"
                  value={Number(editor.getAttributes('companyLogo').marginBefore || 0)}
                  onChange={(e) => {
                    editor.chain().focus().updateCompanyLogoLayout({ marginBefore: Number(e.target.value) }).run();
                    setToolbarTick((n) => n + 1);
                  }}
                />
              </label>
              <label className="inline-flex items-center gap-1">
                Depois
                <input
                  type="number"
                  min={0}
                  max={96}
                  className="w-14 h-7 rounded bg-[#1b1d22] border border-white/15 px-1"
                  value={Number(editor.getAttributes('companyLogo').marginAfter || 0)}
                  onChange={(e) => {
                    editor.chain().focus().updateCompanyLogoLayout({ marginAfter: Number(e.target.value) }).run();
                    setToolbarTick((n) => n + 1);
                  }}
                />
              </label>
              <span>proporção preservada</span>
            </span>
          )}
          <select
            className="h-8 max-w-[220px] rounded-md bg-[#1b1d22] border border-white/15 text-xs px-2"
            value={replaceKey}
            onChange={(e) => {
              const key = e.target.value;
              setReplaceKey('');
              if (key) insertField(key);
            }}
          >
            <option value="">Substituir seleção por campo</option>
            {CUSTOM_PLACEHOLDERS.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-gray-400 px-2">
            {countVisualA4Pages(html, visualPageCount)} página{countVisualA4Pages(html, visualPageCount) === 1 ? '' : 's'} A4
          </span>
        </div>
      </header>

      {(error || notice) && (
        <div className="px-4 pt-2 text-xs">
          {error && <p className="text-amber-200">{error}</p>}
          {notice && <p className="text-emerald-200">{notice}</p>}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div className="sv-a4-scroll flex-1 overflow-auto py-6 px-4 bg-[#2a2d36]">
          <div className="sv-a4-stack">
            <div className="sv-a4-sheet">
              {initialHtml !== '' && (
                <CustomContractTiptap
                  initialHtml={initialHtml}
                  contentKey={contentKey}
                  companyLogoUrl={companyLogoUrl}
                  onEditor={handleEditor}
                  onChange={scheduleAutosave}
                  onPageCount={handlePageCount}
                  onSelection={handleSelection}
                />
              )}
            </div>
          </div>
        </div>

        <aside className="w-[300px] shrink-0 border-l border-white/10 bg-[#15171d] overflow-auto p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Campos automáticos
          </h2>
          <p className="text-[11px] text-gray-500 mb-3">
            Insere no cursor. O campo aparece como chip; o HTML gravado conserva o token {'{{TOKEN}}'}.
          </p>
          {CUSTOM_PLACEHOLDER_GROUPS.map((group) => {
            const open = openGroups[group.id] === true;
            return (
              <div key={group.id} className="mb-2 rounded-lg border border-white/10">
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs font-semibold"
                  onClick={() => setOpenGroups((prev) => ({ ...prev, [group.id]: !open }))}
                >
                  {open ? '▾' : '▸'} {group.label}
                </button>
                {open && (
                  <div className="px-2 pb-2 flex flex-wrap gap-1.5">
                    {placeholdersByGroup(group.id as CustomPlaceholderGroupId).map((field) => (
                      <button
                        key={field.key}
                        type="button"
                        title={field.token}
                        onClick={() => insertField(field.key)}
                        className="text-[11px] px-2 py-1 rounded-full bg-sky-500/15 text-sky-100 border border-sky-500/30 hover:bg-sky-500/25"
                      >
                        {field.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </aside>
      </div>

      {panel === 'preview' && (
        <EditorModal title="Visualizar documento" onClose={() => setPanel(null)}>
          <p className="text-xs text-gray-400 mb-3">
            Escolha uma venda existente só para conferir os campos. Não cria venda, contrato, financeiro
            nem assinatura. Não grava generated_html.
          </p>
          <label className="block text-xs text-gray-400 mb-1">Venda / contrato da empresa</label>
          <select
            value={previewSaleId}
            disabled={previewLoading}
            onChange={(e) => void applyPreviewSale(e.target.value)}
            className="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm mb-3"
          >
            <option value="">Campos sem dados reais (chips)</option>
            {previewSales.map((sale) => (
              <option key={sale.id} value={sale.id}>
                {sale.label}
              </option>
            ))}
          </select>
          {previewLoading && <p className="text-xs text-gray-400 mb-2">Carregando dados da venda…</p>}
          <button
            type="button"
            className="mb-3 h-8 px-3 rounded-lg border border-white/10 text-xs"
            onClick={() => {
              const root = previewPrintRef.current;
              if (root) printCustomContractPreview(root, name || 'Contrato');
            }}
          >
            Gerar PDF
          </button>
          <div
            ref={previewPrintRef}
            className="sv-editor-preview-doc max-h-[70vh] overflow-auto bg-[#2a2d36] p-4 rounded-lg"
          >
            <CustomA4PaginatedHtml
              html={
                previewFilled ||
                highlightCustomPlaceholdersForPreview(
                  sanitizeImportedContractHtml(previewHtml || html),
                  companyLogoUrl,
                )
              }
            />
          </div>
        </EditorModal>
      )}

      {panel === 'history' && (
        <EditorModal title="Histórico de versões" onClose={() => setPanel(null)}>
          <ul className="space-y-2 text-sm">
            {versions
              .slice()
              .sort((a, b) => {
                if (a.status === 'draft') return -1;
                if (b.status === 'draft') return 1;
                return b.version - a.version;
              })
              .map((row) => (
                <li key={row.id} className="rounded-lg border border-white/10 px-3 py-2">
                  <div className="font-medium">
                    {row.status === 'draft' ? 'Rascunho' : `Versão v${row.version}`}
                  </div>
                  <div className="text-xs text-gray-400">
                    {row.status === 'published' ? 'Publicada' : 'Editável'} ·{' '}
                    {fmtDate(row.published_at || row.updated_at || row.created_at)}
                  </div>
                  {row.status === 'published' && (
                    <button
                      type="button"
                      className="mt-2 text-xs text-sky-300"
                      onClick={() => {
                        setPreviewHtml(row.content_html || '');
                        setPanel('preview');
                      }}
                    >
                      Ver esta versão
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </EditorModal>
      )}

      {panel === 'manage' && (
        <EditorModal title="Gerenciar empreendimentos" onClose={() => setPanel(null)}>
          <ManageContractModelProjectsPanel
            links={links.map((link) => ({
              id: link.id,
              projectId: link.project_id,
              projectName: projects.find((p) => p.id === link.project_id)?.name || 'Empreendimento',
              isProjectDefault: link.is_project_default,
            }))}
            projects={projects}
            saving={linkSaving}
            onAssociate={(projectId, asDefault) =>
              runLinkAction(() => handleAssociateProject(projectId, asDefault), 'Empreendimento associado.')
            }
            onSetDefault={(link) =>
              runLinkAction(
                () => handleSetProjectDefault(link.id, link.projectId),
                'Padrão do empreendimento atualizado.',
              )
            }
            onDetach={(link) => runLinkAction(() => handleDetachLink(link), 'Associação removida.')}
          />
        </EditorModal>
      )}

      {panel === 'rebuildEstrela' && (
        <EditorModal title={REBUILD_ESTRELA_CUSTOM_LABEL} onClose={() => setPanel(null)}>
          <p className="text-sm text-slate-300 whitespace-pre-line">{REBUILD_ESTRELA_CUSTOM_CONFIRM}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="h-9 px-3 rounded-lg border border-white/15 text-xs"
              onClick={() => setPanel(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="h-9 px-3 rounded-lg bg-[var(--color-primary)] text-xs font-semibold"
              onClick={() =>
                void handleRebuildEstrelaOfficial().catch((e) =>
                  setError(e instanceof Error ? e.message : 'Não foi possível reconstruir o contrato.'),
                )
              }
            >
              {REBUILD_ESTRELA_CUSTOM_LABEL}
            </button>
          </div>
        </EditorModal>
      )}

      {panel === 'saveAs' && (
        <EditorModal title="Salvar como novo" onClose={() => setPanel(null)}>
          <input
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            className="w-full h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm"
          />
          <button
            type="button"
            className="mt-3 h-9 px-3 rounded-lg bg-[var(--color-primary)] text-xs font-semibold"
            onClick={() =>
              void handleSaveAsNew().catch((e) =>
                setError(e instanceof Error ? e.message : 'Falha ao copiar o modelo.'),
              )
            }
          >
            Criar novo modelo
          </button>
        </EditorModal>
      )}
    </div>
  );
}

function EditorModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-auto p-4">
      <div className="w-full max-w-4xl rounded-xl border border-white/10 bg-[#12141a] p-4 mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" className="text-xs text-gray-400" onClick={onClose}>
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
