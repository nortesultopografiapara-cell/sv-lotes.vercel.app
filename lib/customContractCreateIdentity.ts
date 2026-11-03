/**
 * Identidade de criação de modelo na Central.
 * Sem GIS, sem generateContractHTML, sem dependência da store operacional.
 */

export type NewModelCreationMode = 'custom' | 'existing';

export type UserCreatedModelIdentity = {
  catalogCode: string;
  engineKey: string;
  source: 'user';
  status: 'active';
  openA4Editor: boolean;
};

/**
 * Personalizado ignora qualquer modelo pré-selecionado no select (ex.: Araguaia).
 * Somente mode === 'existing' herda catalog_code/engine_key da base.
 */
export function resolveUserCreatedModelIdentity(input: {
  mode: NewModelCreationMode;
  baseCatalogCode?: string | null;
  baseEngineKey?: string | null;
}): UserCreatedModelIdentity {
  if (input.mode === 'custom') {
    return {
      catalogCode: 'CUSTOM',
      engineKey: 'custom',
      source: 'user',
      status: 'active',
      openA4Editor: true,
    };
  }
  const catalogCode = String(input.baseCatalogCode || '').trim();
  if (!catalogCode) {
    throw new Error('Escolha um modelo de origem.');
  }
  const engineKey =
    String(input.baseEngineKey || '').trim() ||
    (catalogCode === 'CUSTOM' ? 'custom' : 'classic');
  return {
    catalogCode,
    engineKey,
    source: 'user',
    status: 'active',
    openA4Editor: catalogCode === 'CUSTOM',
  };
}

export function configureOrEditTarget(catalogCode: string): 'a4-editor' | 'locked-sheet' {
  return String(catalogCode || '').trim() === 'CUSTOM' ? 'a4-editor' : 'locked-sheet';
}

export function visualizeTarget(catalogCode: string): 'custom-preview' | 'typescript-preview' {
  return String(catalogCode || '').trim() === 'CUSTOM' ? 'custom-preview' : 'typescript-preview';
}
