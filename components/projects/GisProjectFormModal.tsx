'use client';

import type { FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { ProjectLfContractConfigFields } from '@/components/projects/ProjectLfContractConfigFields';
import { ProjectRevenueSplitPanel } from '@/components/projects/ProjectRevenueSplitPanel';
import {
  SALE_CONTRACT_MODEL_LABELS,
  SALE_CONTRACT_MODEL_OPTIONS,
  normalizeSaleContractModel,
  type SaleContractModel,
} from '@/lib/contractModel';
import {
  formatFinancialAccountLabel,
  type CompanyFinancialAccountType,
} from '@/lib/finance/companyFinancialAccountTypes';
import type { LfContractConfigFormState } from '@/lib/lfImoveisContractConfig';
import type { ProjectModalMode } from '@/lib/project-form';

const FIELD_CLASS =
  'w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]';

const COL_CLASS =
  'rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]/40 p-3 flex flex-col gap-3 min-w-0';

export type GisProjectFormFeedback = { type: 'success' | 'error'; message: string };

export type GisProjectFormAccount = {
  id: string;
  name: string;
  accountType: string;
  beneficiaryName: string | null;
  isDefault: boolean;
  provider?: string | null;
  asaasWalletLinked?: boolean;
  asaasWalletMasked?: string | null;
};

type MundoNovoContact = {
  order: number;
  name: string;
  email: string;
  phone: string;
};

type Props = {
  mode: ProjectModalMode;
  feedback: GisProjectFormFeedback | null;
  submitting: boolean;
  name: string;
  city: string;
  uf: string;
  neighborhood: string;
  address: string;
  forumCity: string;
  financialAccountId: string;
  contractModel: string;
  companyDefaultContractModel: SaleContractModel;
  financialAccounts: GisProjectFormAccount[];
  mundoNovoSellerContacts: MundoNovoContact[];
  lfContractConfig: LfContractConfigFormState;
  companySecondVendorJson: unknown;
  editingProjectId: string | null;
  onClose: () => void;
  onSubmit: (e?: FormEvent) => void | Promise<void>;
  onNameChange: (value: string) => void;
  onCityChange: (value: string) => void;
  onUfChange: (value: string) => void;
  onNeighborhoodChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onForumCityChange: (value: string) => void;
  onFinancialAccountIdChange: (value: string) => void;
  onContractModelChange: (value: string) => void;
  onMundoNovoSellerContactsChange: (next: MundoNovoContact[]) => void;
  onLfContractConfigChange: (next: LfContractConfigFormState) => void;
};

function ColumnTitle({ children }: { children: string }) {
  return (
    <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
      {children}
    </p>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
      {children}
    </label>
  );
}

export function GisProjectFormModal(props: Props) {
  const effectiveModel = normalizeSaleContractModel(
    props.contractModel || props.companyDefaultContractModel,
  );
  const showLf = effectiveModel === 'ESTRELA_DO_SUL';
  const showMundoNovo =
    effectiveModel === 'MUNDO_NOVO' && props.mundoNovoSellerContacts.length > 0;
  const isEdit = props.mode === 'edit';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-3 sm:p-4">
      <div
        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl w-[min(90vw,1500px)] max-h-[90vh] overflow-hidden shadow-2xl fade-in-up flex flex-col"
        data-testid="gis-project-form-modal"
      >
        <div className="px-5 py-3 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="font-bold text-[var(--text-primary)] text-lg">
            {isEdit ? 'Editar Projeto' : 'Novo Projeto'}
          </h3>
          <button
            type="button"
            onClick={props.onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={props.onSubmit}
          className="flex-1 min-h-0 flex flex-col"
        >
          {props.feedback ? (
            <div
              role="alert"
              className={`mx-5 mt-4 shrink-0 rounded-lg border px-3 py-2 text-sm ${
                props.feedback.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-300'
              }`}
            >
              {props.feedback.message}
            </div>
          ) : null}

          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
              <section className={COL_CLASS} data-testid="gis-project-col-empreendimento">
                <ColumnTitle>Empreendimento</ColumnTitle>
                <div>
                  <FieldLabel>Nome do Projeto *</FieldLabel>
                  <input
                    type="text"
                    required
                    value={props.name}
                    onChange={(e) => props.onNameChange(e.target.value)}
                    placeholder="Ex: Loteamento Bosque das Árvores"
                    className={FIELD_CLASS}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Cidade *</FieldLabel>
                    <input
                      type="text"
                      required
                      value={props.city}
                      onChange={(e) => props.onCityChange(e.target.value)}
                      placeholder="Ex: Parauapebas"
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div>
                    <FieldLabel>UF *</FieldLabel>
                    <input
                      type="text"
                      required
                      maxLength={2}
                      value={props.uf}
                      onChange={(e) => props.onUfChange(e.target.value.toUpperCase())}
                      placeholder="Ex: PA"
                      className={`${FIELD_CLASS} uppercase`}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Bairro/Localidade</FieldLabel>
                  <input
                    type="text"
                    value={props.neighborhood}
                    onChange={(e) => props.onNeighborhoodChange(e.target.value)}
                    placeholder="Ex: Centro"
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <FieldLabel>Endereço/Referência</FieldLabel>
                  <input
                    type="text"
                    value={props.address}
                    onChange={(e) => props.onAddressChange(e.target.value)}
                    placeholder="Endereço principal da área"
                    className={FIELD_CLASS}
                  />
                </div>
                <div>
                  <FieldLabel>Município / Foro do Contrato</FieldLabel>
                  <input
                    type="text"
                    value={props.forumCity}
                    onChange={(e) => props.onForumCityChange(e.target.value)}
                    placeholder="Ex: Parauapebas (Deixe vazio para usar a cidade)"
                    className={FIELD_CLASS}
                  />
                </div>
              </section>

              <section className={COL_CLASS} data-testid="gis-project-col-contrato">
                <ColumnTitle>Contrato / Proprietário</ColumnTitle>
                <div>
                  <FieldLabel>Modelo de contrato padrão do empreendimento</FieldLabel>
                  <select
                    value={props.contractModel}
                    onChange={(e) => props.onContractModelChange(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    <option value="">
                      Usar modelo padrão da empresa (
                      {SALE_CONTRACT_MODEL_LABELS[props.companyDefaultContractModel]})
                    </option>
                    {SALE_CONTRACT_MODEL_OPTIONS.map((model) => (
                      <option key={model} value={model}>
                        {SALE_CONTRACT_MODEL_LABELS[model]}
                      </option>
                    ))}
                  </select>
                </div>
                {showMundoNovo ? (
                  <div className="rounded-lg border border-[var(--color-border)] p-3 flex flex-col gap-3">
                    <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                      Contato dos PROMITENTES VENDEDORES (e-sign)
                    </p>
                    {props.mundoNovoSellerContacts.map((seller, idx) => (
                      <div key={`${seller.order}-${seller.name}`} className="flex flex-col gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {seller.name}
                        </p>
                        <input
                          type="email"
                          value={seller.email}
                          onChange={(e) =>
                            props.onMundoNovoSellerContactsChange(
                              props.mundoNovoSellerContacts.map((row, rowIdx) =>
                                rowIdx === idx ? { ...row, email: e.target.value } : row,
                              ),
                            )
                          }
                          placeholder="E-mail"
                          className={FIELD_CLASS}
                        />
                        <input
                          type="tel"
                          value={seller.phone}
                          onChange={(e) =>
                            props.onMundoNovoSellerContactsChange(
                              props.mundoNovoSellerContacts.map((row, rowIdx) =>
                                rowIdx === idx ? { ...row, phone: e.target.value } : row,
                              ),
                            )
                          }
                          placeholder="Telefone / WhatsApp"
                          className={FIELD_CLASS}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
                {showLf ? (
                  <ProjectLfContractConfigFields
                    value={props.lfContractConfig}
                    onChange={props.onLfContractConfigChange}
                    companySecondVendorJson={props.companySecondVendorJson}
                  />
                ) : null}
              </section>

              <section
                className={`${COL_CLASS} lg:col-span-2 xl:col-span-1`}
                data-testid="gis-project-col-financeiro"
              >
                <ColumnTitle>Financeiro / Recebimentos</ColumnTitle>
                <div>
                  <FieldLabel>Conta financeira padrão do empreendimento</FieldLabel>
                  <select
                    value={props.financialAccountId}
                    onChange={(e) => props.onFinancialAccountIdChange(e.target.value)}
                    className={FIELD_CLASS}
                  >
                    <option value="">Usar conta padrão da empresa</option>
                    {props.financialAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {formatFinancialAccountLabel({
                          name: account.name,
                          accountType:
                            (account.accountType as CompanyFinancialAccountType) || 'IMOBILIARIA',
                          beneficiaryName: account.beneficiaryName,
                          provider: account.provider ?? null,
                        })}
                        {account.isDefault ? ' (Padrão)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {isEdit && props.editingProjectId ? (
                  <ProjectRevenueSplitPanel
                    projectId={props.editingProjectId}
                    projectName={props.name}
                    accounts={props.financialAccounts}
                  />
                ) : (
                  <p className="text-xs rounded-md border border-[var(--color-border)] p-2 text-[var(--color-text-muted)]">
                    A Distribuição de Recebimentos fica disponível depois de criar o projeto.
                  </p>
                )}
              </section>
            </div>
          </div>

          <div className="shrink-0 border-t border-[var(--color-border)] px-5 py-3 flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={props.onClose}
              className="px-4 py-2.5 rounded-lg border border-[var(--color-border)] text-[var(--text-primary)] font-semibold hover:bg-[var(--color-background)] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={props.submitting}
              className="min-w-[180px] bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
              {props.submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isEdit ? (
                'Salvar Alterações'
              ) : (
                'Criar Projeto'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
