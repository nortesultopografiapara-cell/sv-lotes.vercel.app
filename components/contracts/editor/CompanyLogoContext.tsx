'use client';

import { createContext, useContext } from 'react';

export type CompanyLogoContextValue = {
  url: string | null;
};

export const CompanyLogoContext = createContext<CompanyLogoContextValue>({ url: null });

export function useCompanyLogoUrl(): string | null {
  return useContext(CompanyLogoContext).url;
}
