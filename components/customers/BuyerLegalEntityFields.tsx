'use client';

import { formatCpfCnpj } from '@/lib/inputMasks';
import {
  emptyBuyerRepresentative,
  isValidCpfCheckDigits,
  type BuyerRepresentativeInput,
  type BuyerSignatureMode,
} from '@/lib/buyerLegalEntity';

type Props = {
  tradeName: string;
  registrationStatus: string;
  addressNumber: string;
  addressComplement: string;
  signatureMode: BuyerSignatureMode;
  representatives: BuyerRepresentativeInput[];
  disabled?: boolean;
  onChange: (patch: {
    trade_name?: string;
    registration_status?: string;
    address_number?: string;
    address_complement?: string;
    buyer_signature_mode?: BuyerSignatureMode;
    legal_representatives?: BuyerRepresentativeInput[];
  }) => void;
};

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm text-slate-900';

export function BuyerLegalEntityFields({
  tradeName,
  registrationStatus,
  addressNumber,
  addressComplement,
  signatureMode,
  representatives,
  disabled,
  onChange,
}: Props) {
  const reps = representatives.length > 0 ? representatives : [emptyBuyerRepresentative()];

  const updateRep = (index: number, patch: Partial<BuyerRepresentativeInput>) => {
    const next = reps.map((rep, i) => (i === index ? { ...rep, ...patch } : rep));
    onChange({ legal_representatives: next });
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-sm font-bold text-slate-900">Dados da pessoa jurídica</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-slate-700">
          Nome fantasia
          <input
            className={inputClass}
            disabled={disabled}
            value={tradeName}
            onChange={(e) => onChange({ trade_name: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Situação cadastral
          <input
            className={inputClass}
            disabled={disabled}
            value={registrationStatus}
            onChange={(e) => onChange({ registration_status: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Número
          <input
            className={inputClass}
            disabled={disabled}
            value={addressNumber}
            onChange={(e) => onChange({ address_number: e.target.value })}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Complemento
          <input
            className={inputClass}
            disabled={disabled}
            value={addressComplement}
            onChange={(e) => onChange({ address_complement: e.target.value })}
          />
        </label>
      </div>

      <div>
        <p className="text-sm font-bold text-slate-900">Representante legal da pessoa jurídica</p>
        <p className="text-xs text-slate-600 mt-1">
          A consulta do CNPJ não define poderes de representação. Informe quem pode assinar.
        </p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-800">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="buyer-signature-mode"
              checked={signatureMode !== 'JOINT'}
              disabled={disabled}
              onChange={() => onChange({ buyer_signature_mode: 'INDIVIDUAL' })}
            />
            Assinatura individual
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="buyer-signature-mode"
              checked={signatureMode === 'JOINT'}
              disabled={disabled}
              onChange={() =>
                onChange({
                  buyer_signature_mode: 'JOINT',
                  legal_representatives: reps.map((rep) => ({ ...rep, signs: true })),
                })
              }
            />
            Assinatura conjunta
          </label>
        </div>
      </div>

      {reps.map((rep, index) => {
        const cpfOk = !rep.cpf || isValidCpfCheckDigits(rep.cpf);
        return (
          <fieldset key={index} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
            <legend className="px-1 text-xs font-bold text-slate-800">
              Representante {index + 1}
            </legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                className={inputClass}
                placeholder="Nome completo"
                disabled={disabled}
                value={rep.full_name || ''}
                onChange={(e) => updateRep(index, { full_name: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder="CPF"
                disabled={disabled}
                value={rep.cpf || ''}
                onChange={(e) => updateRep(index, { cpf: formatCpfCnpj(e.target.value) })}
              />
              {!cpfOk && <p className="text-xs text-red-600 md:col-span-2">CPF do representante inválido.</p>}
              <input className={inputClass} placeholder="RG ou documento" disabled={disabled} value={rep.rg || ''} onChange={(e) => updateRep(index, { rg: e.target.value })} />
              <input className={inputClass} placeholder="Órgão emissor" disabled={disabled} value={rep.rg_issuer || ''} onChange={(e) => updateRep(index, { rg_issuer: e.target.value })} />
              <input className={inputClass} placeholder="UF emissora" maxLength={2} disabled={disabled} value={rep.rg_issuer_state || ''} onChange={(e) => updateRep(index, { rg_issuer_state: e.target.value.toUpperCase() })} />
              <input className={inputClass} placeholder="Nacionalidade" disabled={disabled} value={rep.nationality || ''} onChange={(e) => updateRep(index, { nationality: e.target.value })} />
              <input className={inputClass} placeholder="Estado civil" disabled={disabled} value={rep.marital_status || ''} onChange={(e) => updateRep(index, { marital_status: e.target.value })} />
              <input className={inputClass} placeholder="Profissão" disabled={disabled} value={rep.profession || ''} onChange={(e) => updateRep(index, { profession: e.target.value })} />
              <input className={inputClass} placeholder="Cargo ou função" disabled={disabled} value={rep.role_title || ''} onChange={(e) => updateRep(index, { role_title: e.target.value })} />
              <input className={inputClass} placeholder="Telefone" disabled={disabled} value={rep.phone || ''} onChange={(e) => updateRep(index, { phone: e.target.value })} />
              <input className={inputClass} placeholder="E-mail" disabled={disabled} value={rep.email || ''} onChange={(e) => updateRep(index, { email: e.target.value })} />
              <input className={`${inputClass} md:col-span-2`} placeholder="Documento que comprova a representação" disabled={disabled} value={rep.representation_document || ''} onChange={(e) => updateRep(index, { representation_document: e.target.value })} />
            </div>
            {signatureMode !== 'JOINT' && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={rep.signs !== false}
                  onChange={(e) => {
                    const next = reps.map((item, i) => ({
                      ...item,
                      signs: i === index ? e.target.checked : false,
                    }));
                    onChange({ legal_representatives: next });
                  }}
                />
                Representante autorizado a assinar este contrato
              </label>
            )}
            {reps.length > 1 && (
              <button
                type="button"
                className="text-xs text-red-700"
                disabled={disabled}
                onClick={() =>
                  onChange({ legal_representatives: reps.filter((_, i) => i !== index) })
                }
              >
                Remover representante
              </button>
            )}
          </fieldset>
        );
      })}

      <button
        type="button"
        className="text-sm font-semibold text-slate-800"
        disabled={disabled}
        onClick={() =>
          onChange({
            legal_representatives: [
              ...reps,
              { ...emptyBuyerRepresentative(), signs: signatureMode === 'JOINT' },
            ],
          })
        }
      >
        Adicionar representante
      </button>
    </div>
  );
}
