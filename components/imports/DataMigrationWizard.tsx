'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileUp,
  Info,
  Loader2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ImportTypeCard } from '@/components/imports/ImportTypeCard';
import { WizardStepIndicator } from '@/components/imports/WizardStepIndicator';
import {
  CUSTOMER_PREVIEW_FILTERS,
  CUSTOMER_ROW_STATUS_LABELS,
  customerRowStatusClass,
  detectImportFileStatusLabel,
  filterCustomerPreviewRows,
} from '@/components/imports/customerImportUi';
import { useAuth } from '@/hooks/useAuth';
import { ACCEPTED_IMPORT_ACCEPT_ATTR } from '@/lib/imports/constants';
import { listImportModules, getImportModuleById } from '@/lib/imports/modules';
import {
  isAcceptedImportFile,
  parseImportFileMeta,
} from '@/lib/imports/helpers/parseImportFileMeta';
import type { CustomerImportValidationResult } from '@/lib/imports/modules/customers/types';
import {
  advanceWizardState,
  canAdvanceWizardStep,
  INITIAL_MIGRATION_WIZARD_STATE,
  retreatWizardState,
  selectImportModule,
  startMigrationWizard,
} from '@/lib/imports/services/migrationWizardState';
import {
  downloadImportCsvTemplate,
  downloadImportExcelTemplate,
} from '@/lib/imports/services/templateDownload';
import type { ImportModuleId, MigrationWizardState } from '@/lib/imports/types';

async function validateCustomersFile(
  file: File,
  activeTenantId: string | null,
): Promise<CustomerImportValidationResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (activeTenantId) formData.append('activeTenantId', activeTenantId);

  const response = await fetch('/api/data-migration/customers/validate', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Falha na validação do arquivo.');
  }

  return payload.validation as CustomerImportValidationResult;
}

async function executeCustomersImport(
  file: File,
  activeTenantId: string | null,
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('confirmed', 'true');
  if (activeTenantId) formData.append('activeTenantId', activeTenantId);

  const response = await fetch('/api/data-migration/customers/execute', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Falha ao importar clientes.');
  }

  return payload.result;
}

export function DataMigrationWizard() {
  const { user } = useAuth();
  const [state, setState] = useState<MigrationWizardState>(
    INITIAL_MIGRATION_WIZARD_STATE,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rawFileRef = useRef<File | null>(null);
  const modules = useMemo(() => listImportModules(), []);
  const selectedModule = state.selectedModuleId
    ? getImportModuleById(state.selectedModuleId)
    : null;
  const isCustomersModule = state.selectedModuleId === 'customers';
  const activeTenantId = user?.tenant_id || user?.company_id || null;

  const handleSelectModule = (moduleId: ImportModuleId) => {
    rawFileRef.current = null;
    setState((prev) => selectImportModule(prev, moduleId));
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (!isAcceptedImportFile(file)) {
      alert('Selecione um arquivo .xlsx, .xls ou .csv.');
      return;
    }
    rawFileRef.current = file;
    setState((prev) => ({
      ...prev,
      uploadedFile: parseImportFileMeta(file),
      customerValidation: null,
      customerImportResult: null,
    }));
  };

  const handleAdvance = async () => {
    if (state.step === 'upload' && isCustomersModule && rawFileRef.current) {
      setState((prev) => ({ ...prev, validating: true }));
      try {
        const validation = await validateCustomersFile(
          rawFileRef.current,
          activeTenantId,
        );
        setState((prev) => ({
          ...advanceWizardState(prev),
          customerValidation: validation,
          validating: false,
        }));
      } catch (err) {
        setState((prev) => ({ ...prev, validating: false }));
        alert(err instanceof Error ? err.message : 'Erro ao validar arquivo.');
      }
      return;
    }

    setState((prev) => advanceWizardState(prev));
  };

  const handleConfirmImport = async () => {
    if (!isCustomersModule || !rawFileRef.current || !state.customerValidation) return;

    const importable = state.customerValidation.summary.importableRows;
    const ignored = state.customerValidation.summary.ignoredRows;

    const confirmed = window.confirm(
      `Confirmar importação de ${importable} novo(s) cliente(s)?\n\n${ignored} registro(s) serão ignorados por erro, duplicidade ou por já existirem no sistema.\n\nClientes existentes NÃO serão alterados.`,
    );
    if (!confirmed) return;

    setState((prev) => ({ ...prev, importing: true }));
    try {
      const result = await executeCustomersImport(rawFileRef.current, activeTenantId);
      setState((prev) => ({
        ...prev,
        step: 'confirmation',
        customerImportResult: result,
        importing: false,
      }));
    } catch (err) {
      setState((prev) => ({ ...prev, importing: false }));
      alert(err instanceof Error ? err.message : 'Erro ao importar clientes.');
    }
  };

  const previewRows = useMemo(() => {
    if (!state.customerValidation) return [];
    return filterCustomerPreviewRows(
      state.customerValidation.rows,
      state.customerPreviewFilter,
    );
  }, [state.customerValidation, state.customerPreviewFilter]);

  const renderPlaceholderModuleNotice = () => (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
      <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-100/90">
        Este módulo ainda não está habilitado. Apenas Clientes possui importação ativa nesta
        fase.
      </p>
    </div>
  );

  const renderStep = () => {
    switch (state.step) {
      case 'welcome':
        return (
          <div className="space-y-4" data-testid="migration-step-welcome">
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                    Bem-vindo ao assistente de migração
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Este assistente auxilia na migração de informações de outros sistemas e
                    planilhas Excel para o SV LOTES de forma segura e orientada.
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-3">
                    A importação de Clientes está disponível. Os demais módulos serão habilitados
                    nas próximas atualizações.
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              data-testid="migration-start-button"
              onClick={() => setState(startMigrationWizard())}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Iniciar Migração
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        );

      case 'select-type':
        return (
          <div className="space-y-4" data-testid="migration-step-select-type">
            <p className="text-sm text-[var(--text-secondary)]">
              Escolha o tipo de importação que deseja realizar.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {modules.map((module) => (
                <ImportTypeCard
                  key={module.id}
                  module={module}
                  selected={state.selectedModuleId === module.id}
                  onSelect={handleSelectModule}
                />
              ))}
            </div>
          </div>
        );

      case 'template':
        return (
          <div className="space-y-4" data-testid="migration-step-template">
            <p className="text-sm text-[var(--text-secondary)]">
              Baixe o modelo correspondente ao tipo{' '}
              <strong className="text-[var(--text-primary)]">
                {selectedModule?.title ?? '—'}
              </strong>{' '}
              antes de preparar sua planilha.
            </p>
            {!isCustomersModule ? renderPlaceholderModuleNotice() : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                data-testid="download-template-xlsx"
                disabled={!state.selectedModuleId}
                onClick={() =>
                  state.selectedModuleId &&
                  void downloadImportExcelTemplate(state.selectedModuleId)
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium hover:bg-[var(--bg-card-alt)] disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                Baixar modelo Excel
              </button>
              <button
                type="button"
                data-testid="download-template-csv"
                disabled={!state.selectedModuleId}
                onClick={() =>
                  state.selectedModuleId &&
                  downloadImportCsvTemplate(state.selectedModuleId)
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-sm font-medium hover:bg-[var(--bg-card-alt)] disabled:opacity-50"
              >
                <Download className="w-4 h-4 text-[var(--color-primary)]" />
                Baixar modelo CSV
              </button>
            </div>
          </div>
        );

      case 'upload':
        return (
          <div className="space-y-4" data-testid="migration-step-upload">
            <p className="text-sm text-[var(--text-secondary)]">
              Selecione o arquivo preparado (.xlsx, .xls ou .csv).
              {isCustomersModule
                ? ' Ao avançar, o arquivo será validado sem gravar dados.'
                : ' Nenhum dado será gravado nesta fase.'}
            </p>
            {!isCustomersModule ? renderPlaceholderModuleNotice() : null}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMPORT_ACCEPT_ATTR}
              className="hidden"
              data-testid="migration-file-input"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-8 hover:border-[var(--color-primary)]/40 transition-colors"
            >
              <div className="flex flex-col items-center gap-2 text-[var(--text-secondary)]">
                <Upload className="w-8 h-8 text-[var(--color-primary)]" />
                <span className="text-sm font-medium">Clique para selecionar arquivo</span>
                <span className="text-xs text-[var(--text-muted)]">xlsx, xls ou csv</span>
              </div>
            </button>
            {state.uploadedFile ? (
              <div
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"
                data-testid="migration-file-meta"
              >
                <div className="flex items-center gap-2 text-emerald-300 font-medium mb-2">
                  <FileUp className="w-4 h-4" />
                  Arquivo selecionado
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[var(--text-secondary)]">
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Nome</dt>
                    <dd>{state.uploadedFile.name}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Tamanho</dt>
                    <dd>{state.uploadedFile.sizeLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Extensão</dt>
                    <dd>{state.uploadedFile.extension}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Tipo detectado</dt>
                    <dd>{state.uploadedFile.extension.replace('.', '').toUpperCase()}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Status</dt>
                    <dd>
                      {isCustomersModule
                        ? detectImportFileStatusLabel(
                            state.uploadedFile.extension.replace('.', ''),
                            1,
                          )
                        : 'Aguardando validação'}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        );

      case 'pre-validation':
        if (!isCustomersModule || !state.customerValidation) {
          return (
            <div className="space-y-4" data-testid="migration-step-pre-validation">
              {renderPlaceholderModuleNotice()}
            </div>
          );
        }

        return (
          <div className="space-y-4" data-testid="migration-step-pre-validation">
            <p className="text-sm text-[var(--text-secondary)]">
              Pré-validação concluída. Nenhum dado foi gravado nesta etapa.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ['Total lidas', state.customerValidation.summary.totalRows],
                ['Válidas', state.customerValidation.summary.validRows],
                ['Com avisos', state.customerValidation.summary.warningRows],
                ['Com erros', state.customerValidation.summary.errorRows],
                ['Duplicadas na planilha', state.customerValidation.summary.duplicateRows],
                ['Já existentes', state.customerValidation.summary.existingRows],
                ['Ignoradas', state.customerValidation.summary.ignoredRows],
                ['A importar', state.customerValidation.summary.importableRows],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-3 text-center"
                >
                  <p className="text-[10px] uppercase text-[var(--text-muted)]">{label}</p>
                  <p className="text-xl font-bold text-[var(--text-primary)] mt-1">{value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-secondary)]">
              <p>
                Linhas no arquivo: <strong>{state.customerValidation.rowCount}</strong> · Tipo:{' '}
                <strong>{state.customerValidation.fileType.toUpperCase()}</strong>
              </p>
            </div>
          </div>
        );

      case 'preview':
        if (!isCustomersModule || !state.customerValidation) {
          return (
            <div className="space-y-4" data-testid="migration-step-preview">
              {renderPlaceholderModuleNotice()}
            </div>
          );
        }

        return (
          <div className="space-y-4" data-testid="migration-step-preview">
            <div className="flex flex-wrap gap-2">
              {CUSTOMER_PREVIEW_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  data-testid={`preview-filter-${filter.id}`}
                  onClick={() =>
                    setState((prev) => ({ ...prev, customerPreviewFilter: filter.id }))
                  }
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                    state.customerPreviewFilter === filter.id
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                      : 'border-[var(--border-color)] text-[var(--text-muted)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-[var(--border-color)] overflow-x-auto">
              <table className="w-full text-sm min-w-[960px]">
                <thead className="bg-[var(--bg-main)]/60 border-b border-[var(--border-color)]">
                  <tr>
                    {[
                      'Linha',
                      'Nome',
                      'CPF/CNPJ',
                      'Telefone',
                      'WhatsApp',
                      'E-mail',
                      'Cidade/UF',
                      'Status',
                      'Mensagens',
                    ].map((header) => (
                      <th
                        key={header}
                        className="px-3 py-3 text-left text-[10px] font-mono uppercase text-[var(--text-muted)]"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-4 py-8 text-center text-[var(--text-muted)]"
                      >
                        Nenhuma linha para o filtro selecionado.
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((row) => (
                      <tr
                        key={row.lineNumber}
                        className="border-t border-[var(--border-color)]"
                      >
                        <td className="px-3 py-2">{row.lineNumber}</td>
                        <td className="px-3 py-2">{row.nome}</td>
                        <td className="px-3 py-2">{row.cpf_cnpj || '—'}</td>
                        <td className="px-3 py-2">{row.telefone || '—'}</td>
                        <td className="px-3 py-2">{row.whatsapp || '—'}</td>
                        <td className="px-3 py-2">{row.email || '—'}</td>
                        <td className="px-3 py-2">
                          {[row.cidade, row.uf].filter(Boolean).join('/') || '—'}
                        </td>
                        <td
                          className={`px-3 py-2 font-medium ${customerRowStatusClass(row.status)}`}
                        >
                          {CUSTOMER_ROW_STATUS_LABELS[row.status]}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                          {row.messages.map((message) => message.text).join(' · ') || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'confirmation':
        if (isCustomersModule && state.customerImportResult) {
          return (
            <div className="space-y-4" data-testid="migration-step-confirmation">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                  Importação concluída
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Foram importados{' '}
                  <strong>{state.customerImportResult.imported}</strong> novos clientes.
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-2">
                  <strong>{state.customerImportResult.ignored}</strong> registros foram ignorados
                  por erro, duplicidade ou por já existirem no sistema.
                </p>
              </div>
              <button
                type="button"
                data-testid="migration-back-to-start"
                onClick={() => {
                  rawFileRef.current = null;
                  setState(INITIAL_MIGRATION_WIZARD_STATE);
                }}
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                Voltar ao início do assistente
              </button>
            </div>
          );
        }

        return (
          <div className="space-y-4" data-testid="migration-step-confirmation">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                Estrutura de migração criada
              </h2>
              <p className="text-sm text-[var(--text-secondary)] max-w-lg mx-auto">
                A importação deste módulo será habilitada nas próximas atualizações do SV LOTES.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setState(INITIAL_MIGRATION_WIZARD_STATE)}
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              Voltar ao início do assistente
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const showNav = state.step !== 'welcome' && state.step !== 'confirmation';
  const showConfirmImport =
    isCustomersModule && state.step === 'preview' && state.customerValidation != null;

  return (
    <div data-testid="data-migration-wizard">
      {state.step !== 'welcome' ? (
        <WizardStepIndicator currentStep={state.step} />
      ) : null}

      {renderStep()}

      {showConfirmImport ? (
        <div className="mt-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Serão importados{' '}
            <strong>{state.customerValidation?.summary.importableRows ?? 0}</strong> novos clientes.
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            <strong>{state.customerValidation?.summary.ignoredRows ?? 0}</strong> registros serão
            ignorados por erro, duplicidade ou já existirem no sistema.
          </p>
          <button
            type="button"
            data-testid="migration-confirm-import"
            disabled={state.importing || (state.customerValidation?.summary.importableRows ?? 0) === 0}
            onClick={() => void handleConfirmImport()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-40"
          >
            {state.importing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Confirmar Importação
          </button>
        </div>
      ) : null}

      {showNav ? (
        <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-[var(--border-color)]">
          <button
            type="button"
            data-testid="migration-wizard-back"
            onClick={() => setState((prev) => retreatWizardState(prev))}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-color)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-card-alt)]"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <button
            type="button"
            data-testid="migration-wizard-next"
            disabled={!canAdvanceWizardStep(state) || state.validating}
            onClick={() => void handleAdvance()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-bold disabled:opacity-40"
          >
            {state.validating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Avançar
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
