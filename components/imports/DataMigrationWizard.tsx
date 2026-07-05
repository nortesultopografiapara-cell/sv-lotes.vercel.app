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
  Sparkles,
  Upload,
} from 'lucide-react';
import { ImportTypeCard } from '@/components/imports/ImportTypeCard';
import { WizardStepIndicator } from '@/components/imports/WizardStepIndicator';
import { ACCEPTED_IMPORT_ACCEPT_ATTR } from '@/lib/imports/constants';
import { listImportModules, getImportModuleById } from '@/lib/imports/modules';
import {
  isAcceptedImportFile,
  parseImportFileMeta,
} from '@/lib/imports/helpers/parseImportFileMeta';
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
  downloadImportExcelTemplatePlaceholder,
} from '@/lib/imports/services/templateDownload';
import type { ImportModuleId, MigrationWizardState } from '@/lib/imports/types';

export function DataMigrationWizard() {
  const [state, setState] = useState<MigrationWizardState>(
    INITIAL_MIGRATION_WIZARD_STATE,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modules = useMemo(() => listImportModules(), []);
  const selectedModule = state.selectedModuleId
    ? getImportModuleById(state.selectedModuleId)
    : null;

  const handleSelectModule = (moduleId: ImportModuleId) => {
    setState((prev) => selectImportModule(prev, moduleId));
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (!isAcceptedImportFile(file)) {
      alert('Selecione um arquivo .xlsx, .xls ou .csv.');
      return;
    }
    setState((prev) => ({
      ...prev,
      uploadedFile: parseImportFileMeta(file),
    }));
  };

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
                    Nesta fase, o fluxo está preparado para validação e pré-visualização. A
                    gravação definitiva será habilitada nas próximas atualizações.
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
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                data-testid="download-template-xlsx"
                disabled={!state.selectedModuleId}
                onClick={() =>
                  state.selectedModuleId &&
                  downloadImportExcelTemplatePlaceholder(state.selectedModuleId)
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
              Selecione o arquivo preparado (.xlsx, .xls ou .csv). Nenhum dado será gravado nesta
              fase.
            </p>
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
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Selecionado em</dt>
                    <dd>{new Date(state.uploadedFile.selectedAt).toLocaleString('pt-BR')}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-[var(--text-muted)]">Extensão</dt>
                    <dd>{state.uploadedFile.extension}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
        );

      case 'pre-validation':
        return (
          <div className="space-y-4" data-testid="migration-step-pre-validation">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
              <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-100/90">
                Módulo de validação será habilitado na próxima etapa.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                ['Linhas válidas', '—'],
                ['Linhas inválidas', '—'],
                ['Duplicadas', '—'],
                ['Avisos', '—'],
                ['Erros', '—'],
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
          </div>
        );

      case 'preview':
        return (
          <div className="space-y-4" data-testid="migration-step-preview">
            <p className="text-sm text-[var(--text-secondary)]">
              Pré-visualização dos dados importados (estrutura preparada).
            </p>
            <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-main)]/60 border-b border-[var(--border-color)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-mono uppercase text-[var(--text-muted)]">
                      Coluna
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-mono uppercase text-[var(--text-muted)]">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-[var(--text-muted)]">
                      A tabela será preenchida quando a importação for ativada.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'confirmation':
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

  return (
    <div data-testid="data-migration-wizard">
      {state.step !== 'welcome' ? (
        <WizardStepIndicator currentStep={state.step} />
      ) : null}

      {renderStep()}

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
            disabled={!canAdvanceWizardStep(state)}
            onClick={() => setState((prev) => advanceWizardState(prev))}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-bold disabled:opacity-40"
          >
            Avançar
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
