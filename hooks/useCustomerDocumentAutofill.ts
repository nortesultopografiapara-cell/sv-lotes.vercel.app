'use client';

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { lookupCnpj } from '@/lib/cnpjLookup';
import { lookupCep } from '@/lib/cepLookup';
import {
  formatCep,
  formatCpfCnpj,
  getCepValidationState,
  getCpfCnpjValidationState,
  normalizeCep,
  normalizeCpfCnpj,
} from '@/lib/inputMasks';
import { mergeAutofillOnlyEmpty } from '@/lib/mergeAutofillFields';

export type LookupStatusMessage =
  | ''
  | 'Buscando CEP...'
  | 'CEP encontrado'
  | 'CEP não encontrado'
  | 'Não foi possível consultar o CEP'
  | 'Buscando CNPJ...'
  | 'CNPJ encontrado'
  | 'CNPJ não encontrado'
  | 'Não foi possível consultar o CNPJ';

export type CustomerAutofillFieldMap = {
  name?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  state_uf?: string;
  cep?: string;
  zip_code?: string;
  email?: string;
  phone?: string;
  cpf_cnpj?: string;
};

type Options<T extends Record<string, unknown>> = {
  formData: T;
  setFormData: Dispatch<SetStateAction<T>>;
  fields: CustomerAutofillFieldMap;
  disabled?: boolean;
};

export function useCustomerDocumentAutofill<T extends Record<string, unknown>>({
  formData,
  setFormData,
  fields,
  disabled = false,
}: Options<T>) {
  const mergeEmpty = useCallback(
    (patch: Record<string, unknown>) => {
      setFormData((prev) =>
        mergeAutofillOnlyEmpty(
          prev as Record<string, unknown>,
          patch,
        ) as T,
      );
    },
    [setFormData],
  );
  const cpfCnpjKey = (fields.cpf_cnpj || 'cpf_cnpj') as keyof T;
  const cepKey = (fields.cep || fields.zip_code || 'cep') as keyof T;

  const cpfCnpjValue = String(formData[cpfCnpjKey] ?? '');
  const cepValue = String(
    formData[cepKey] ?? formData[(fields.zip_code || 'zip_code') as keyof T] ?? '',
  );

  const cpfCnpjValidation = getCpfCnpjValidationState(cpfCnpjValue);
  const cepValidation = getCepValidationState(cepValue);

  const [cepLookupMessage, setCepLookupMessage] =
    useState<LookupStatusMessage>('');
  const [cnpjLookupMessage, setCnpjLookupMessage] =
    useState<LookupStatusMessage>('');

  const lastCepLookupRef = useRef('');
  const lastCnpjLookupRef = useRef('');
  const cepAbortRef = useRef(0);
  const cnpjAbortRef = useRef(0);

  const handleCpfCnpjChange = (raw: string) => {
    setFormData((prev) => ({
      ...prev,
      [cpfCnpjKey]: formatCpfCnpj(raw),
    }));
  };

  const handleCepChange = (raw: string) => {
    const formatted = formatCep(raw);
    setFormData((prev) => {
      const next = { ...prev, [cepKey]: formatted } as T;
      if (fields.zip_code && fields.zip_code !== String(cepKey)) {
        (next as Record<string, unknown>)[fields.zip_code] = formatted;
      }
      return next;
    });
  };

  useEffect(() => {
    if (disabled || !cepValidation.shouldLookupCep) {
      if (!cepValidation.shouldLookupCep) setCepLookupMessage('');
      return;
    }

    const digits = normalizeCep(cepValue);
    if (digits === lastCepLookupRef.current) return;

    const runId = ++cepAbortRef.current;
    lastCepLookupRef.current = digits;
    setCepLookupMessage('Buscando CEP...');

    void lookupCep(cepValue)
      .then((result) => {
        if (runId !== cepAbortRef.current) return;
        if (!result.ok) {
          setCepLookupMessage(
            result.reason === 'not_found'
              ? 'CEP não encontrado'
              : 'Não foi possível consultar o CEP',
          );
          return;
        }

        const mapped: Record<string, unknown> = {};
        if (fields.address) mapped[fields.address] = result.fields.address;
        if (fields.neighborhood) {
          mapped[fields.neighborhood] = result.fields.neighborhood;
        }
        if (fields.city) mapped[fields.city] = result.fields.city;
        if (fields.state) mapped[fields.state] = result.fields.state;
        if (fields.state_uf) mapped[fields.state_uf] = result.fields.state_uf;
        if (fields.cep) mapped[fields.cep] = result.fields.cep;
        if (fields.zip_code) mapped[fields.zip_code] = result.fields.zip_code;

        mergeEmpty(mapped);
        setCepLookupMessage('CEP encontrado');
      })
      .catch(() => {
        if (runId !== cepAbortRef.current) return;
        setCepLookupMessage('Não foi possível consultar o CEP');
      });
  }, [cepValue, cepValidation.shouldLookupCep, disabled, fields, mergeEmpty]);

  useEffect(() => {
    if (disabled || !cpfCnpjValidation.shouldLookupCnpj) {
      if (!cpfCnpjValidation.shouldLookupCnpj) setCnpjLookupMessage('');
      return;
    }

    const digits = normalizeCpfCnpj(cpfCnpjValue);
    if (digits === lastCnpjLookupRef.current) return;

    const runId = ++cnpjAbortRef.current;
    lastCnpjLookupRef.current = digits;
    setCnpjLookupMessage('Buscando CNPJ...');

    void lookupCnpj(cpfCnpjValue)
      .then((result) => {
        if (runId !== cnpjAbortRef.current) return;
        if (!result.ok) {
          setCnpjLookupMessage(
            result.reason === 'not_found'
              ? 'CNPJ não encontrado'
              : 'Não foi possível consultar o CNPJ',
          );
          return;
        }

        const mapped: Record<string, unknown> = {};
        if (fields.name) mapped[fields.name] = result.fields.name;
        if (fields.cpf_cnpj) mapped[fields.cpf_cnpj] = result.fields.cpf_cnpj;
        if (fields.address) mapped[fields.address] = result.fields.address;
        if (fields.neighborhood) {
          mapped[fields.neighborhood] = result.fields.neighborhood;
        }
        if (fields.city) mapped[fields.city] = result.fields.city;
        if (fields.state) mapped[fields.state] = result.fields.state;
        if (fields.state_uf) mapped[fields.state_uf] = result.fields.state_uf;
        if (fields.cep) mapped[fields.cep] = result.fields.cep;
        if (fields.zip_code) mapped[fields.zip_code] = result.fields.zip_code;
        if (fields.email) mapped[fields.email] = result.fields.email;
        if (fields.phone) mapped[fields.phone] = result.fields.phone;

        mergeEmpty(mapped);
        setCnpjLookupMessage('CNPJ encontrado');
      })
      .catch(() => {
        if (runId !== cnpjAbortRef.current) return;
        setCnpjLookupMessage('Não foi possível consultar o CNPJ');
      });
  }, [cpfCnpjValue, cpfCnpjValidation.shouldLookupCnpj, disabled, fields, mergeEmpty]);

  return {
    cpfCnpjValidation,
    cepValidation,
    cepLookupMessage,
    cnpjLookupMessage,
    handleCpfCnpjChange,
    handleCepChange,
  };
}
