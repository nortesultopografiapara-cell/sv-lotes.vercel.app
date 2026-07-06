export const LEGACY_CONTRACTS_ROUTE = '/legacy-contracts' as const;

export const LEGACY_CONTRACT_LINK_TYPES = ['automatic', 'manual'] as const;
export type LegacyContractLinkType = (typeof LEGACY_CONTRACT_LINK_TYPES)[number];
