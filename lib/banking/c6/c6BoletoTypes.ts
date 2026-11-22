/**
 * Tipos do POST/GET/PUT /v1/bank_slips/ conforme OpenAPI C6 1.7.2.
 */

import type { BankEnvironment } from '@/lib/banking/types';
import type { C6BoletoOperation } from '@/lib/banking/c6/c6BoletoOpenApi';

export type C6BoletoAddress = {
  street: string;
  number: number;
  complement?: string;
  city: string;
  state: string;
  zip_code: string;
};

export type C6BoletoPayer = {
  name: string;
  tax_id: string;
  email?: string;
  address: C6BoletoAddress;
};

export type C6BoletoDiscountDetails = {
  value: number;
  dead_line: number;
};

export type C6BoletoDiscount = {
  discount_type: 'V' | 'P';
  first?: C6BoletoDiscountDetails;
  second?: C6BoletoDiscountDetails;
  third?: C6BoletoDiscountDetails;
};

export type C6BoletoInterest = {
  type: 'V' | 'P';
  value: number;
  dead_line: number;
};

export type C6BoletoFine = {
  type: 'V' | 'P';
  value: number;
  dead_line: number;
};

export type C6BankSlipCreateRequest = {
  external_reference_id: string;
  amount: number;
  due_date: string;
  payer: C6BoletoPayer;
  billing_scheme?: string;
  instructions?: string[];
  discount?: C6BoletoDiscount;
  interest?: C6BoletoInterest;
  fine?: C6BoletoFine;
  our_number?: string;
};

export type C6BankSlipAlterRequest = {
  amount?: number;
  due_date?: string;
  discount?: C6BoletoDiscount;
  interest?: C6BoletoInterest;
  fine?: C6BoletoFine;
};

export type C6BankSlipCreateResponse = {
  amount?: number;
  due_date?: string;
  originator_id?: string;
  our_number?: string;
  billing_scheme?: string;
  billing_type?: string;
  id?: string;
  bar_code?: string;
  digitable_line?: string;
};

export type C6BankSlipPayment = {
  date?: string;
  amount?: number;
};

export type C6BankSlipResponse = C6BankSlipCreateResponse & {
  originator_id?: string;
  external_reference_id?: string;
  status?: 'CREATED' | 'PAID' | 'CANCELLED' | string;
  emission_date?: string;
  instructions?: string[];
  payments?: C6BankSlipPayment[];
  internal_id?: string;
  discount?: C6BoletoDiscount;
  interest?: C6BoletoInterest;
  fine?: C6BoletoFine;
  payer?: C6BoletoPayer;
  base64_pdf_file?: string;
};

export type C6BoletoCreateInput = {
  companyId: string;
  environment: BankEnvironment;
  external_reference_id: string;
  amount: number;
  due_date: string;
  payer: {
    name: string;
    tax_id: string;
    email?: string;
    address: {
      street: string;
      number: number | string;
      complement?: string;
      city: string;
      state: string;
      zip_code: string;
    };
  };
  billing_scheme?: string;
  instructions?: string[];
  discount?: C6BoletoDiscount;
  interest?: C6BoletoInterest;
  fine?: C6BoletoFine;
  our_number?: string;
};

export type C6BoletoPreparedHttp = {
  companyId: string;
  environment: BankEnvironment;
  operation: C6BoletoOperation;
  method: 'GET' | 'POST' | 'PUT';
  url: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
  jsonBody: Record<string, unknown> | null;
  billingScheme: string | null;
};

export type C6BoletoHomologCase = 'B_01' | 'B_02' | 'B_03' | 'B_04' | 'B_05' | 'B_06' | 'B_07' | 'B_08';
