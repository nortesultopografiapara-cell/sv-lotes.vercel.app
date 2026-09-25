'use client';

import type { ContractSecondVendorFields } from '@/lib/contractSecondVendor';
import {
  isContractSecondVendorComplete,
  isContractSecondVendorFieldsEmpty,
  parseContractSecondVendorJson,
} from '@/lib/contractSecondVendor';
import {
  isLfParticipationValid,
  parseLfPercent,
  type LfContractConfigFormState,
} from '@/lib/lfImoveisContractConfig';

const FIELD_CLASS =
  'w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-3 text-[var(--text-primary)] focus:outline-none focus:border-[var(--color-primary)]';

type Props = {
  value: LfContractConfigFormState;
  onChange: (next: LfContractConfigFormState) => void;
  companySecondVendorJson?: unknown;
};

const VENDOR_FIELDS: Array<{
  key: keyof ContractSecondVendorFields;
  label: string;
  type?: string;
  placeholder?: string;
  span2?: boolean;
  maxLength?: number;
}> = [
  { key: 'name', label: 'Nome completo', placeholder: 'Nome completo', span2: true },
  { key: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
  { key: 'rg', label: 'RG' },
  { key: 'rgIssuer', label: 'Órgão emissor', placeholder: 'SSP' },
  { key: 'rgUf', label: 'UF do RG', placeholder: 'PA', maxLength: 2 },
  { key: 'nationality', label: 'Nacionalidade', placeholder: 'Brasileira' },
  { key: 'maritalStatus', label: 'Estado civil' },
  { key: 'profession', label: 'Profissão' },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'phone', label: 'Telefone / WhatsApp' },
  { key: 'address', label: 'Endereço', span2: true },
];

export function ProjectLfContractConfigFields({
  value,
  onChange,
  companySecondVendorJson,
}: Props) {
  const companyVendor = parseContractSecondVendorJson(companySecondVendorJson);
  const companyComplete = isContractSecondVendorComplete(companyVendor);
  const projectVendorComplete = isContractSecondVendorComplete(value.secondVendor);
  const projectVendorEmpty = isContractSecondVendorFieldsEmpty(value.secondVendor);
  const first = parseLfPercent(value.firstVendorPercent);
  const second = parseLfPercent(value.secondVendorPercent);
  const percentsEmpty = !String(value.firstVendorPercent || '').trim() &&
    !String(value.secondVendorPercent || '').trim();
  const percentsValid = isLfParticipationValid(first, second);

  function patchVendor(key: keyof ContractSecondVendorFields, next: string) {
    onChange({
      ...value,
      secondVendor: { ...value.secondVendor, [key]: next },
    });
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-3 flex flex-col gap-3">
      <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
        Configuração contratual — LF Imóveis
      </p>
      <p className="text-xs text-[var(--color-text-muted)]">
        Segundo vendedor/proprietário e participação deste empreendimento. Não altera o Split de Recebimentos.
      </p>

      {projectVendorEmpty && companyComplete ? (
        <p className="text-xs rounded-md bg-[var(--color-background)] border border-[var(--color-border)] p-2 text-[var(--text-primary)]">
          Sem vendedor próprio neste empreendimento: o contrato usará o segundo vendedor da empresa
          {companyVendor.name ? ` (${companyVendor.name})` : ''}.
        </p>
      ) : null}
      {projectVendorComplete ? (
        <p className="text-xs rounded-md bg-[var(--color-background)] border border-[var(--color-border)] p-2 text-[var(--text-primary)]">
          Este empreendimento usa vendedor próprio. O segundo vendedor da empresa não entra neste contrato.
        </p>
      ) : null}
      {percentsEmpty ? (
        <p className="text-xs rounded-md bg-[var(--color-background)] border border-[var(--color-border)] p-2 text-[var(--text-primary)]">
          Sem percentuais próprios: o contrato usará 40% (LF Imóveis) e 60% (segundo vendedor).
        </p>
      ) : null}

      <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mt-1">
        Qualificação do segundo vendedor/proprietário
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {VENDOR_FIELDS.map((field) => (
          <div key={field.key} className={field.span2 ? 'md:col-span-2' : undefined}>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              {field.label}
            </label>
            <input
              type={field.type || 'text'}
              value={value.secondVendor[field.key]}
              maxLength={field.maxLength}
              placeholder={field.placeholder}
              onChange={(e) => patchVendor(field.key, e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
            Participação LF Imóveis (%)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={value.firstVendorPercent}
            placeholder="40"
            onChange={(e) => onChange({ ...value, firstVendorPercent: e.target.value })}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
            Participação segundo vendedor (%)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={value.secondVendorPercent}
            placeholder="60"
            onChange={(e) => onChange({ ...value, secondVendorPercent: e.target.value })}
            className={FIELD_CLASS}
          />
        </div>
      </div>
      {!percentsEmpty && !percentsValid ? (
        <p className="text-xs text-red-600">
          Os percentuais devem ser maiores ou iguais a 0 e somar exatamente 100%.
        </p>
      ) : null}
    </div>
  );
}
