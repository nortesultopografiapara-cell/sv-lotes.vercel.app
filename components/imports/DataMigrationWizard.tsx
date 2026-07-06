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
  customerRowStatusClass,
  detectImportFileStatusLabel,
  filterImportPreviewRows,
  IMPORT_PREVIEW_FILTERS,
  IMPORT_ROW_STATUS_LABELS,
} from '@/components/imports/customerImportUi';
import { LegacyContractManualLinkModal } from '@/components/imports/LegacyContractManualLinkModal';
import type { LegacyContractManualLinkFormValues } from '@/components/imports/LegacyContractManualLinkModal';
import {
  getLegacyContractRowResultLabel,
  getLegacyContractSaleLocatedLabel,
  legacyContractRowResultClass,
  shouldShowLegacyContractManualLinkButton,
} from '@/components/imports/legacyContractPreviewUi';
import { useAuth } from '@/hooks/useAuth';
import { ACCEPTED_IMPORT_ACCEPT_ATTR } from '@/lib/imports/constants';
import { listImportModules, getImportModuleById } from '@/lib/imports/modules';
import type { BrokerImportValidationResult } from '@/lib/imports/modules/brokers/types';
import type { LegacyContractImportValidationResult } from '@/lib/imports/modules/legacy-contracts/types';
import type { SaleImportValidationResult } from '@/lib/imports/modules/sales/types';
import {
  isAcceptedImportFile,
  parseImportFileMeta,
} from '@/lib/imports/helpers/parseImportFileMeta';
import {
  filterAcceptedLegacyDocumentFiles,
} from '@/lib/imports/helpers/legacyContractFormData';
import { executeLegacyContractsImport } from '@/lib/imports/helpers/legacyContractExecuteClient';
import { resolveLegacyContractManualLinkRemote } from '@/lib/imports/helpers/legacyContractManualLinkClient';
import { validateLegacyContractsFiles } from '@/lib/imports/helpers/legacyContractValidationClient';
import type { CustomerImportValidationResult } from '@/lib/imports/modules/customers/types';
import type { ValidatedLegacyContractRow } from '@/lib/imports/modules/legacy-contracts/types';
import {
  advanceWizardState,
  applyBrokerValidationAndAdvance,
  applyCustomerValidationAndAdvance,
  applyLegacyContractsValidationAndAdvance,
  applySalesValidationAndAdvance,
  canAdvanceWizardStep,
  INITIAL_MIGRATION_WIZARD_STATE,
  isActiveImportModule,
  retreatWizardState,
  selectImportModule,
  startMigrationWizard,
  updateLegacyContractManualLinkRow,
  validateCurrentWizardStep,
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

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const apiError =
      (typeof payload.error === 'string' && payload.error) ||
      (typeof payload.message === 'string' && payload.message) ||
      `Falha na validação do arquivo (${response.status}).`;
    throw new Error(apiError);
  }

  if (!payload.validation) {
    throw new Error('Resposta de validação inválida.');
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

async function validateBrokersFile(
  file: File,
  activeTenantId: string | null,
): Promise<BrokerImportValidationResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (activeTenantId) formData.append('activeTenantId', activeTenantId);

  const response = await fetch('/api/data-migration/brokers/validate', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const apiError =
      (typeof payload.error === 'string' && payload.error) ||
      (typeof payload.message === 'string' && payload.message) ||
      `Falha na validação do arquivo (${response.status}).`;
    throw new Error(apiError);
  }

  if (!payload.validation) {
    throw new Error('Resposta de validação inválida.');
  }

  return payload.validation as BrokerImportValidationResult;
}

async function executeBrokersImport(
  file: File,
  activeTenantId: string | null,
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('confirmed', 'true');
  if (activeTenantId) formData.append('activeTenantId', activeTenantId);

  const response = await fetch('/api/data-migration/brokers/execute', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    throw new Error(
      (typeof payload.error === 'string' && payload.error) ||
        'Falha ao importar corretores.',
    );
  }

  return payload.result;
}

async function validateSalesFile(
  file: File,
  activeTenantId: string | null,
): Promise<SaleImportValidationResult> {
  const formData = new FormData();
  formData.append('file', file);
  if (activeTenantId) formData.append('activeTenantId', activeTenantId);

  const response = await fetch('/api/data-migration/sales/validate', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    const apiError =
      (typeof payload.error === 'string' && payload.error) ||
      (typeof payload.message === 'string' && payload.message) ||
      `Falha na validação do arquivo (${response.status}).`;
    throw new Error(apiError);
  }

  if (!payload.validation) {
    throw new Error('Resposta de validação inválida.');
  }

  return payload.validation as SaleImportValidationResult;
}

async function executeSalesImport(file: File, activeTenantId: string | null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('confirmed', 'true');
  if (activeTenantId) formData.append('activeTenantId', activeTenantId);

  const response = await fetch('/api/data-migration/sales/execute', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({} as Record<string, unknown>));
  if (!response.ok) {
    throw new Error(
      (typeof payload.error === 'string' && payload.error) || 'Falha ao importar vendas.',
    );
  }

  return payload.result;
}

export function DataMigrationWizard() {
  const { user } = useAuth();
  const [state, setState] = useState<MigrationWizardState>(
    INITIAL_MIGRATION_WIZARD_STATE,
  );
  const [manualLinkRow, setManualLinkRow] = useState<ValidatedLegacyContractRow | null>(
    null,
  );
  const mappingFileInputRef = useRef<HTMLInputElement>(null);
  const documentFilesInputRef = useRef<HTMLInputElement>(null);
  const mappingFileRef = useRef<File | null>(null);
  const documentFilesRef = useRef<File[]>([]);
  const wizardStepRef = useRef(state.step);
  wizardStepRef.current = state.step;
  const modules = useMemo(() => listImportModules(), []);
  const selectedModule = state.selectedModuleId
    ? getImportModuleById(state.selectedModuleId)
    : null;
  const isCustomersModule = state.selectedModuleId === 'customers';
  const isBrokersModule = state.selectedModuleId === 'brokers';
  const isSalesModule = state.selectedModuleId === 'sales';
  const isLegacyContractsModule = state.selectedModuleId === 'legacy_contracts';
  const isImportModuleActive = isActiveImportModule(state.selectedModuleId);
  const activeTenantId = user?.tenant_id || user?.company_id || null;

  const handleSelectModule = (moduleId: ImportModuleId) => {
    mappingFileRef.current = null;
    documentFilesRef.current = [];
    setState((prev) => selectImportModule(prev, moduleId));
  };

  const handleMappingFileChange = (file: File | null) => {
    if (!file || wizardStepRef.current !== 'upload') return;
    if (!isAcceptedImportFile(file)) {
      alert('Selecione um arquivo .xlsx, .xls ou .csv.');
      return;
    }
    mappingFileRef.current = file;
    setState((prev) => ({
      ...prev,
      mappingFile: parseImportFileMeta(file),
      customerValidation: null,
      customerImportResult: null,
      brokerValidation: null,
      brokerImportResult: null,
      salesValidation: null,
      salesImportResult: null,
      legacyContractsValidation: null,
      legacyContractsImportResult: null,
      validationError: null,
    }));
  };

  const handleDocumentFilesChange = (fileList: FileList | null) => {
    if (wizardStepRef.current !== 'upload-documents') return;
    if (!fileList || fileList.length === 0) return;

    const acceptedFiles = filterAcceptedLegacyDocumentFiles(Array.from(fileList));
    if (acceptedFiles.length === 0) {
      alert('Selecione arquivos PDF ou um ZIP contendo PDFs.');
      return;
    }

    documentFilesRef.current = acceptedFiles;
    setState((prev) => ({
      ...prev,
      documentFiles: acceptedFiles.map((file) => parseImportFileMeta(file)),
      legacyContractsValidation: null,
      legacyContractsImportResult: null,
      validating: false,
      validationError: null,
    }));
  };

  const openMappingFilePicker = () => {
    if (wizardStepRef.current !== 'upload') return;
    const input = mappingFileInputRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const openDocumentsFilePicker = () => {
    if (wizardStepRef.current !== 'upload-documents') return;
    const input = documentFilesInputRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const handleAdvance = async () => {
    const stepValidationError = validateCurrentWizardStep(state, {
      mappingFile: mappingFileRef.current,
      documentFiles: documentFilesRef.current,
    });
    if (stepValidationError) {
      setState((prev) => ({ ...prev, validationError: stepValidationError }));
      return;
    }

    if (state.step === 'upload' && isCustomersModule) {
      const file = mappingFileRef.current;
      if (!file) return;

      setState((prev) => ({ ...prev, validating: true, validationError: null }));
      try {
        const validation = await validateCustomersFile(file, activeTenantId);
        setState((prev) => applyCustomerValidationAndAdvance(prev, validation));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao validar arquivo.';
        setState((prev) => ({
          ...prev,
          validating: false,
          validationError: message,
        }));
      }
      return;
    }

    if (state.step === 'upload' && isBrokersModule) {
      const file = mappingFileRef.current;
      if (!file) return;

      setState((prev) => ({ ...prev, validating: true, validationError: null }));
      try {
        const validation = await validateBrokersFile(file, activeTenantId);
        setState((prev) => applyBrokerValidationAndAdvance(prev, validation));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao validar arquivo.';
        setState((prev) => ({
          ...prev,
          validating: false,
          validationError: message,
        }));
      }
      return;
    }

    if (state.step === 'upload' && isSalesModule) {
      const file = mappingFileRef.current;
      if (!file) return;

      setState((prev) => ({ ...prev, validating: true, validationError: null }));
      try {
        const validation = await validateSalesFile(file, activeTenantId);
        setState((prev) => applySalesValidationAndAdvance(prev, validation));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao validar arquivo.';
        setState((prev) => ({
          ...prev,
          validating: false,
          validationError: message,
        }));
      }
      return;
    }

    if (state.step === 'upload-documents' && isLegacyContractsModule) {
      const documentFiles = documentFilesRef.current;
      if (documentFiles.length === 0) return;

      setState((prev) => ({ ...prev, validating: true, validationError: null }));
      try {
        const validation = await validateLegacyContractsFiles(
          documentFiles,
          activeTenantId,
        );
        setState((prev) => applyLegacyContractsValidationAndAdvance(prev, validation));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro ao validar arquivos.';
        setState((prev) => ({
          ...prev,
          validating: false,
          validationError: message,
        }));
      }
      return;
    }

    setState((prev) => advanceWizardState(prev));
  };

  const handleLegacyManualLinkConfirm = async (
    values: LegacyContractManualLinkFormValues,
  ) => {
    if (!manualLinkRow) return;

    const updatedRow = await resolveLegacyContractManualLinkRemote(
      values,
      activeTenantId,
      manualLinkRow,
    );

    setState((prev) =>
      updateLegacyContractManualLinkRow(prev, manualLinkRow.lineNumber, updatedRow),
    );
    setManualLinkRow(null);
  };

  const handleConfirmImport = async () => {
    if (isLegacyContractsModule && state.legacyContractsValidation) {
      if (documentFilesRef.current.length === 0) return;

      const importable = state.legacyContractsValidation.summary.importableRows;
      const ignored = state.legacyContractsValidation.summary.ignoredRows;

      const confirmed = window.confirm(
        `Confirmar anexo de ${importable} contrato(s) antigo(s)?\n\n${ignored} registro(s) serão ignorados por erro, PDF ausente, venda não localizada ou contrato já anexado.\n\nVendas, parcelas, lotes e contratos ativos do sistema NÃO serão alterados.`,
      );
      if (!confirmed) return;

      setState((prev) => ({ ...prev, importing: true }));
      try {
        const result = await executeLegacyContractsImport(
          documentFilesRef.current,
          activeTenantId,
          state.legacyContractsValidation,
        );
        setState((prev) => ({
          ...prev,
          step: 'confirmation',
          legacyContractsImportResult: result,
          importing: false,
        }));
      } catch (err) {
        setState((prev) => ({ ...prev, importing: false }));
        alert(err instanceof Error ? err.message : 'Erro ao anexar contratos antigos.');
      }
      return;
    }

    if (!mappingFileRef.current) return;

    if (isCustomersModule && state.customerValidation) {
      const importable = state.customerValidation.summary.importableRows;
      const ignored = state.customerValidation.summary.ignoredRows;

      const confirmed = window.confirm(
        `Confirmar importação de ${importable} novo(s) cliente(s)?\n\n${ignored} registro(s) serão ignorados por erro, duplicidade ou por já existirem no sistema.\n\nClientes existentes NÃO serão alterados.`,
      );
      if (!confirmed) return;

      setState((prev) => ({ ...prev, importing: true }));
      try {
        const result = await executeCustomersImport(mappingFileRef.current, activeTenantId);
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
      return;
    }

    if (isBrokersModule && state.brokerValidation) {
      const importable = state.brokerValidation.summary.importableRows;
      const ignored = state.brokerValidation.summary.ignoredRows;

      const confirmed = window.confirm(
        `Confirmar importação de ${importable} novo(s) corretor(es)?\n\n${ignored} registro(s) serão ignorados por erro, duplicidade ou por já existirem no sistema.\n\nCorretores existentes NÃO serão alterados.`,
      );
      if (!confirmed) return;

      setState((prev) => ({ ...prev, importing: true }));
      try {
        const result = await executeBrokersImport(mappingFileRef.current, activeTenantId);
        setState((prev) => ({
          ...prev,
          step: 'confirmation',
          brokerImportResult: result,
          importing: false,
        }));
      } catch (err) {
        setState((prev) => ({ ...prev, importing: false }));
        alert(err instanceof Error ? err.message : 'Erro ao importar corretores.');
      }
      return;
    }

    if (isSalesModule && state.salesValidation) {
      const importable = state.salesValidation.summary.importableRows;
      const ignored = state.salesValidation.summary.ignoredRows;

      const confirmed = window.confirm(
        `Confirmar importação de ${importable} nova(s) venda(s)?\n\n${ignored} registro(s) serão ignorados por erro, duplicidade ou por lotes já vendidos/reservados.\n\nClientes, corretores e lotes existentes NÃO serão alterados indevidamente.`,
      );
      if (!confirmed) return;

      setState((prev) => ({ ...prev, importing: true }));
      try {
        const result = await executeSalesImport(mappingFileRef.current, activeTenantId);
        setState((prev) => ({
          ...prev,
          step: 'confirmation',
          salesImportResult: result,
          importing: false,
        }));
      } catch (err) {
        setState((prev) => ({ ...prev, importing: false }));
        alert(err instanceof Error ? err.message : 'Erro ao importar vendas.');
      }
    }
  };

  const customerPreviewRows = useMemo(() => {
    if (!state.customerValidation) return [];
    return filterImportPreviewRows(
      state.customerValidation.rows,
      state.customerPreviewFilter,
    );
  }, [state.customerValidation, state.customerPreviewFilter]);

  const brokerPreviewRows = useMemo(() => {
    if (!state.brokerValidation) return [];
    return filterImportPreviewRows(
      state.brokerValidation.rows,
      state.brokerPreviewFilter,
    );
  }, [state.brokerValidation, state.brokerPreviewFilter]);

  const salesPreviewRows = useMemo(() => {
    if (!state.salesValidation) return [];
    return filterImportPreviewRows(
      state.salesValidation.rows,
      state.salesPreviewFilter,
    );
  }, [state.salesValidation, state.salesPreviewFilter]);

  const legacyContractsPreviewRows = useMemo(() => {
    if (!state.legacyContractsValidation) return [];
    return filterImportPreviewRows(
      state.legacyContractsValidation.rows,
      state.legacyContractsPreviewFilter,
    );
  }, [state.legacyContractsValidation, state.legacyContractsPreviewFilter]);

  const activeValidationSummary = isCustomersModule
    ? state.customerValidation?.summary
    : isBrokersModule
      ? state.brokerValidation?.summary
      : isSalesModule
        ? state.salesValidation?.summary
        : isLegacyContractsModule
          ? state.legacyContractsValidation?.summary
          : null;

  const activeValidationMeta = isCustomersModule
    ? state.customerValidation
    : isBrokersModule
      ? state.brokerValidation
      : isSalesModule
        ? state.salesValidation
        : isLegacyContractsModule
          ? state.legacyContractsValidation
          : null;

  const renderPlaceholderModuleNotice = () => (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
      <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
      <p className="text-sm text-amber-100/90">
        Este módulo ainda não está habilitado. Clientes, Corretores, Vendas e Contratos Antigos possuem importação ativa nesta fase.
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
                    A importação de Clientes, Corretores, Vendas e Contratos Antigos está disponível. Os demais módulos serão habilitados nas próximas atualizações.
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
              {isLegacyContractsModule ? (
                <>
                  Prepare os PDFs dos contratos antigos para anexar às vendas já existentes.
                  Você poderá enviar arquivos PDF individuais ou um ZIP contendo os PDFs na
                  próxima etapa.
                </>
              ) : (
                <>
                  Baixe o modelo correspondente ao tipo{' '}
                  <strong className="text-[var(--text-primary)]">
                    {selectedModule?.title ?? '—'}
                  </strong>{' '}
                  antes de preparar sua planilha.
                </>
              )}
            </p>
            {!isImportModuleActive ? renderPlaceholderModuleNotice() : null}
            {!isLegacyContractsModule ? (
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
            ) : (
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-secondary)]">
                Na próxima etapa, selecione um ou mais PDFs ou um arquivo ZIP. Para localizar a
                venda automaticamente, nomeie cada PDF com o identificador da venda
                (ex.: <code className="text-[var(--text-primary)]">sale-id.pdf</code>).
              </div>
            )}
          </div>
        );

      case 'upload':
        if (isLegacyContractsModule) return null;
        return (
          <div className="space-y-4" data-testid="migration-step-upload">
            <p className="text-sm text-[var(--text-secondary)]">
              Selecione o arquivo preparado (.xlsx, .xls ou .csv).
              {isImportModuleActive
                ? ' Ao avançar, o arquivo será validado sem gravar dados.'
                : ' Nenhum dado será gravado nesta fase.'}
            </p>
            {!isImportModuleActive ? renderPlaceholderModuleNotice() : null}
            {state.validationError ? (
              <div
                className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
                data-testid="migration-validation-error"
                role="alert"
              >
                {state.validationError}
              </div>
            ) : null}
            {state.validating ? (
              <div
                className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 p-4 flex items-center gap-3 text-sm text-[var(--text-secondary)]"
                data-testid="migration-validating"
              >
                <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)] shrink-0" />
                Validando arquivo… Nenhum dado será gravado nesta etapa.
              </div>
            ) : null}
            <button
              type="button"
              onClick={openMappingFilePicker}
              className="w-full rounded-xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-8 hover:border-[var(--color-primary)]/40 transition-colors"
            >
              <div className="flex flex-col items-center gap-2 text-[var(--text-secondary)]">
                <Upload className="w-8 h-8 text-[var(--color-primary)]" />
                <span className="text-sm font-medium">Clique para selecionar arquivo</span>
                <span className="text-xs text-[var(--text-muted)]">xlsx, xls ou csv</span>
              </div>
            </button>
            {state.mappingFile ? (
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
                    <dd>{state.mappingFile.name}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Tamanho</dt>
                    <dd>{state.mappingFile.sizeLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Extensão</dt>
                    <dd>{state.mappingFile.extension}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Tipo detectado</dt>
                    <dd>{state.mappingFile.extension.replace('.', '').toUpperCase()}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Status</dt>
                    <dd>
                      {isImportModuleActive
                        ? detectImportFileStatusLabel(
                            state.mappingFile.extension.replace('.', ''),
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

      case 'upload-documents':
        return (
          <div className="space-y-4" data-testid="migration-step-upload-documents">
            <p className="text-sm text-[var(--text-secondary)]">
              Selecione os PDFs dos contratos antigos ou um arquivo ZIP contendo os PDFs.
              Ao avançar, os documentos serão validados sem gravar dados.
            </p>
            {state.validationError ? (
              <div
                className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"
                data-testid="migration-validation-error"
                role="alert"
              >
                {state.validationError}
              </div>
            ) : null}
            {state.validating ? (
              <div
                className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 p-4 flex items-center gap-3 text-sm text-[var(--text-secondary)]"
                data-testid="migration-validating"
              >
                <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)] shrink-0" />
                Validando PDFs… Nenhum dado será gravado nesta etapa.
              </div>
            ) : null}
            <button
              type="button"
              onClick={openDocumentsFilePicker}
              className="w-full rounded-xl border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-8 hover:border-[var(--color-primary)]/40 transition-colors"
            >
              <div className="flex flex-col items-center gap-2 text-[var(--text-secondary)]">
                <Upload className="w-8 h-8 text-[var(--color-primary)]" />
                <span className="text-sm font-medium text-center">
                  Selecione os PDFs dos contratos antigos ou um arquivo ZIP contendo os PDFs.
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  PDF, ZIP ou múltiplos PDFs
                </span>
              </div>
            </button>
            {state.documentFiles.length > 0 ? (
              <div
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"
                data-testid="migration-documents-file-meta"
              >
                <div className="flex items-center gap-2 text-emerald-300 font-medium mb-3">
                  <FileUp className="w-4 h-4" />
                  {state.documentFiles.length === 1
                    ? 'Documento selecionado'
                    : `${state.documentFiles.length} documentos selecionados`}
                </div>
                <ul className="space-y-2 text-[var(--text-secondary)]">
                  {state.documentFiles.map((file) => (
                    <li
                      key={`${file.name}-${file.selectedAt}`}
                      className="rounded-lg border border-[var(--border-color)]/60 bg-[var(--bg-card)]/40 px-3 py-2"
                    >
                      <p className="font-medium text-[var(--text-primary)] break-all">{file.name}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {file.sizeLabel} · {file.extension}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        );

      case 'pre-validation':
        if (!isImportModuleActive || !activeValidationMeta || !activeValidationSummary) {
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
                ['Total lidas', activeValidationSummary.totalRows],
                ['Válidas', activeValidationSummary.validRows],
                ['Com avisos', activeValidationSummary.warningRows],
                ['Com erros', activeValidationSummary.errorRows],
                ['Duplicadas na planilha', activeValidationSummary.duplicateRows],
                ['Já existentes', activeValidationSummary.existingRows],
                ['Ignoradas', activeValidationSummary.ignoredRows],
                ['A importar', activeValidationSummary.importableRows],
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
                Linhas no arquivo: <strong>{activeValidationMeta.rowCount}</strong> · Tipo:{' '}
                <strong>{activeValidationMeta.fileType.toUpperCase()}</strong>
                {isLegacyContractsModule && 'pdfCount' in activeValidationMeta ? (
                  <>
                    {' '}
                    · PDFs encontrados: <strong>{activeValidationMeta.pdfCount}</strong>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        );

      case 'preview':
        if (!isImportModuleActive || !activeValidationMeta) {
          return (
            <div className="space-y-4" data-testid="migration-step-preview">
              {renderPlaceholderModuleNotice()}
            </div>
          );
        }

        {
          const previewFilter = isCustomersModule
            ? state.customerPreviewFilter
            : isBrokersModule
              ? state.brokerPreviewFilter
              : isLegacyContractsModule
                ? state.legacyContractsPreviewFilter
                : state.salesPreviewFilter;
          const previewRowsList = isCustomersModule
            ? customerPreviewRows
            : isBrokersModule
              ? brokerPreviewRows
              : isLegacyContractsModule
                ? legacyContractsPreviewRows
                : salesPreviewRows;
          const entityLabel = isCustomersModule
            ? 'cliente'
            : isBrokersModule
              ? 'corretor'
              : isLegacyContractsModule
                ? 'contrato antigo'
                : 'venda';

          const formatMoney = (value: number) =>
            value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

          return (
            <div className="space-y-4" data-testid="migration-step-preview">
              <div className="flex flex-wrap gap-2">
                {IMPORT_PREVIEW_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    data-testid={`preview-filter-${filter.id}`}
                    onClick={() =>
                      setState((prev) =>
                        isCustomersModule
                          ? { ...prev, customerPreviewFilter: filter.id }
                          : isBrokersModule
                            ? { ...prev, brokerPreviewFilter: filter.id }
                            : isLegacyContractsModule
                              ? { ...prev, legacyContractsPreviewFilter: filter.id }
                              : { ...prev, salesPreviewFilter: filter.id },
                      )
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                      previewFilter === filter.id
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
                      {(isCustomersModule
                        ? [
                            'Linha',
                            'Nome',
                            'CPF/CNPJ',
                            'Telefone',
                            'WhatsApp',
                            'E-mail',
                            'Cidade/UF',
                            'Status',
                            'Mensagens',
                          ]
                        : isBrokersModule
                          ? [
                              'Linha',
                              'Nome',
                              'CPF/CNPJ',
                              'Telefone',
                              'WhatsApp',
                              'E-mail',
                              '% Comissão',
                              'Ativo',
                              'Status',
                              'Mensagens',
                            ]
                          : isLegacyContractsModule
                            ? [
                                'Linha',
                                'Cliente',
                                'Empreendimento',
                                'Quadra/Lote',
                                'Venda localizada',
                                'Nº contrato antigo',
                                'PDF',
                                'Status contrato',
                                'Resultado',
                                'Mensagens',
                                'Ações',
                              ]
                            : [
                              'Linha',
                              'Cliente',
                              'Corretor',
                              'Empreendimento',
                              'Quadra/Lote',
                              'Valor',
                              'Entrada/Sinal/Saldo',
                              'Parcelas',
                              'Status venda',
                              'Resultado',
                              'Mensagens',
                            ]
                      ).map((header) => (
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
                    {previewRowsList.length === 0 ? (
                      <tr>
                        <td
                          colSpan={
                            isCustomersModule
                              ? 9
                              : isBrokersModule
                                ? 10
                                : isLegacyContractsModule
                                  ? 11
                                  : 11
                          }
                          className="px-4 py-8 text-center text-[var(--text-muted)]"
                        >
                          Nenhuma linha para o filtro selecionado.
                        </td>
                      </tr>
                    ) : isCustomersModule ? (
                      previewRowsList.map((row) => (
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
                            {IMPORT_ROW_STATUS_LABELS[row.status]}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            {row.messages.map((message) => message.text).join(' · ') || '—'}
                          </td>
                        </tr>
                      ))
                    ) : isBrokersModule ? (
                      previewRowsList.map((row) => (
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
                          <td className="px-3 py-2">{row.percentual_comissao}%</td>
                          <td className="px-3 py-2">{row.ativo ? 'Sim' : 'Não'}</td>
                          <td
                            className={`px-3 py-2 font-medium ${customerRowStatusClass(row.status)}`}
                          >
                            {IMPORT_ROW_STATUS_LABELS[row.status]}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            {row.messages.map((message) => message.text).join(' · ') || '—'}
                          </td>
                        </tr>
                      ))
                    ) : isLegacyContractsModule ? (
                      legacyContractsPreviewRows.map((row) => (
                        <tr
                          key={row.lineNumber}
                          className="border-t border-[var(--border-color)]"
                          data-testid={`legacy-contract-preview-row-${row.lineNumber}`}
                        >
                          <td className="px-3 py-2">{row.lineNumber}</td>
                          <td className="px-3 py-2">
                            <div className="space-y-1">
                              <span>{row.customer_name || '—'}</span>
                              {row.manual_link_applied ? (
                                <span
                                  className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300"
                                  data-testid="legacy-manual-link-badge"
                                >
                                  Vinculado manualmente
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2">{row.empreendimento || '—'}</td>
                          <td className="px-3 py-2">
                            {[row.quadra, row.lote].filter(Boolean).join(' / ') || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {getLegacyContractSaleLocatedLabel(row)}
                          </td>
                          <td className="px-3 py-2">{row.numero_contrato_antigo || '—'}</td>
                          <td className="px-3 py-2">{row.nome_arquivo_pdf || '—'}</td>
                          <td className="px-3 py-2">{row.status_contrato || '—'}</td>
                          <td
                            className={`px-3 py-2 font-medium ${legacyContractRowResultClass(row.status)}`}
                          >
                            {getLegacyContractRowResultLabel(row)}
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                            {row.messages.map((message) => message.text).join(' · ') || '—'}
                          </td>
                          <td className="px-3 py-2">
                            {shouldShowLegacyContractManualLinkButton(row) ? (
                              <button
                                type="button"
                                data-testid={`legacy-manual-link-open-${row.lineNumber}`}
                                onClick={() => setManualLinkRow(row)}
                                className="rounded-lg border border-[var(--color-primary)]/40 px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10"
                              >
                                Vincular Manualmente
                              </button>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      salesPreviewRows.map((row) => (
                        <tr
                          key={row.lineNumber}
                          className="border-t border-[var(--border-color)]"
                        >
                          <td className="px-3 py-2">{row.lineNumber}</td>
                          <td className="px-3 py-2">{row.customer_name || '—'}</td>
                          <td className="px-3 py-2">{row.broker_name || '—'}</td>
                          <td className="px-3 py-2">{row.empreendimento || '—'}</td>
                          <td className="px-3 py-2">
                            {[row.quadra, row.lote].filter(Boolean).join(' / ') || '—'}
                          </td>
                          <td className="px-3 py-2">{formatMoney(row.valor_total)}</td>
                          <td className="px-3 py-2 text-xs">
                            {[formatMoney(row.entrada), formatMoney(row.sinal), row.saldo != null ? formatMoney(row.saldo) : '—'].join(' / ')}
                          </td>
                          <td className="px-3 py-2">{row.quantidade_parcelas}</td>
                          <td className="px-3 py-2">{row.resolved_block_status}</td>
                          <td
                            className={`px-3 py-2 font-medium ${customerRowStatusClass(row.status)}`}
                          >
                            {IMPORT_ROW_STATUS_LABELS[row.status]}
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
              <p className="text-xs text-[var(--text-muted)]">
                Pré-visualização de {entityLabel}s — nenhum dado foi gravado.
              </p>
            </div>
          );
        }

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
                  mappingFileRef.current = null;
                  documentFilesRef.current = [];
                  setState(INITIAL_MIGRATION_WIZARD_STATE);
                }}
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                Voltar ao início do assistente
              </button>
            </div>
          );
        }

        if (isBrokersModule && state.brokerImportResult) {
          return (
            <div className="space-y-4" data-testid="migration-step-confirmation">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                  Importação concluída
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Foram importados{' '}
                  <strong>{state.brokerImportResult.imported}</strong> novos corretores.
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-2">
                  <strong>{state.brokerImportResult.ignored}</strong> registros foram ignorados
                  por erro, duplicidade ou por já existirem no sistema.
                </p>
              </div>
              <button
                type="button"
                data-testid="migration-back-to-start"
                onClick={() => {
                  mappingFileRef.current = null;
                  documentFilesRef.current = [];
                  setState(INITIAL_MIGRATION_WIZARD_STATE);
                }}
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                Voltar ao início do assistente
              </button>
            </div>
          );
        }

        if (isSalesModule && state.salesImportResult) {
          return (
            <div className="space-y-4" data-testid="migration-step-confirmation">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                  Importação concluída
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Foram importadas <strong>{state.salesImportResult.imported}</strong> novas vendas.
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-2">
                  <strong>{state.salesImportResult.ignored}</strong> registros foram ignorados
                  por erro, duplicidade ou lotes já vendidos/reservados.
                </p>
              </div>
              <button
                type="button"
                data-testid="migration-back-to-start"
                onClick={() => {
                  mappingFileRef.current = null;
                  documentFilesRef.current = [];
                  setState(INITIAL_MIGRATION_WIZARD_STATE);
                }}
                className="text-sm text-[var(--color-primary)] hover:underline"
              >
                Voltar ao início do assistente
              </button>
            </div>
          );
        }

        if (isLegacyContractsModule && state.legacyContractsImportResult) {
          return (
            <div className="space-y-4" data-testid="migration-step-confirmation">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <h2 className="text-lg font-bold text-[var(--text-primary)] mb-2">
                  Anexos concluídos
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  Foram anexados{' '}
                  <strong>{state.legacyContractsImportResult.imported}</strong> contrato(s) antigo(s).
                </p>
                <p className="text-sm text-[var(--text-secondary)] mt-2">
                  <strong>{state.legacyContractsImportResult.ignored}</strong> registros foram
                  ignorados por erro, PDF ausente, venda não localizada ou contrato já anexado.
                </p>
              </div>
              <button
                type="button"
                data-testid="migration-back-to-start"
                onClick={() => {
                  mappingFileRef.current = null;
                  documentFilesRef.current = [];
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
    isImportModuleActive &&
    state.step === 'preview' &&
    ((isCustomersModule && state.customerValidation != null) ||
      (isBrokersModule && state.brokerValidation != null) ||
      (isSalesModule && state.salesValidation != null) ||
      (isLegacyContractsModule && state.legacyContractsValidation != null));

  const confirmImportableCount = isCustomersModule
    ? (state.customerValidation?.summary.importableRows ?? 0)
    : isBrokersModule
      ? (state.brokerValidation?.summary.importableRows ?? 0)
      : isLegacyContractsModule
        ? (state.legacyContractsValidation?.summary.importableRows ?? 0)
        : (state.salesValidation?.summary.importableRows ?? 0);
  const confirmIgnoredCount = isCustomersModule
    ? (state.customerValidation?.summary.ignoredRows ?? 0)
    : isBrokersModule
      ? (state.brokerValidation?.summary.ignoredRows ?? 0)
      : isLegacyContractsModule
        ? (state.legacyContractsValidation?.summary.ignoredRows ?? 0)
        : (state.salesValidation?.summary.ignoredRows ?? 0);
  const confirmEntityLabel = isCustomersModule
    ? 'clientes'
    : isBrokersModule
      ? 'corretores'
      : isLegacyContractsModule
        ? 'contratos antigos'
        : 'vendas';
  const confirmActionLabel = isLegacyContractsModule
    ? 'Confirmar Anexo'
    : 'Confirmar Importação';

  return (
    <div data-testid="data-migration-wizard">
      <input
        ref={mappingFileInputRef}
        type="file"
        accept={ACCEPTED_IMPORT_ACCEPT_ATTR}
        className="hidden"
        data-testid="migration-file-input"
        onChange={(e) => {
          handleMappingFileChange(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {isLegacyContractsModule ? (
        <input
          ref={documentFilesInputRef}
          type="file"
          accept=".pdf,.zip,application/pdf,application/zip,application/x-zip-compressed"
          multiple
          className="hidden"
          data-testid="migration-documents-file-input"
          onChange={(e) => {
            handleDocumentFilesChange(e.target.files);
            e.target.value = '';
          }}
        />
      ) : null}

      {state.step !== 'welcome' ? (
        <WizardStepIndicator currentStep={state.step} moduleId={state.selectedModuleId} />
      ) : null}

      {renderStep()}

      {showConfirmImport ? (
        <div className="mt-6 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 space-y-3">
          <p className="text-sm text-[var(--text-secondary)]">
            {isLegacyContractsModule ? 'Serão anexados' : 'Serão importados'}{' '}
            <strong>{confirmImportableCount}</strong>{' '}
            {isLegacyContractsModule ? 'contrato(s) antigo(s)' : `novos ${confirmEntityLabel}`}.
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            <strong>{confirmIgnoredCount}</strong> registros serão ignorados por erro,
            duplicidade ou já existirem no sistema.
          </p>
          <button
            type="button"
            data-testid="migration-confirm-import"
            disabled={state.importing || confirmImportableCount === 0}
            onClick={() => void handleConfirmImport()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-bold disabled:opacity-40"
          >
            {state.importing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {confirmActionLabel}
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
            {state.validating ? 'Validando…' : 'Avançar'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : null}

      <LegacyContractManualLinkModal
        open={manualLinkRow != null}
        row={manualLinkRow}
        activeTenantId={activeTenantId}
        userId={user?.id || null}
        onClose={() => setManualLinkRow(null)}
        onConfirm={handleLegacyManualLinkConfirm}
      />
    </div>
  );
}
