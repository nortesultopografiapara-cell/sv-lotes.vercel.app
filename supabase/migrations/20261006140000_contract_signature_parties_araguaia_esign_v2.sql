-- Fundação ARAGUAIA e-sign V2 — amplia roles de contract_signature_parties.
-- NÃO recria UNIQUE (contract_signature_id, role) sem predicado (bloqueava 2 VENDOR).
-- NÃO cria party_order. NÃO altera status, FKs nem registros existentes.
-- Compatível com o schema real de Production:
--   - contract_signature_parties_unique_role ausente
--   - contract_signature_parties_role_check presente
--   - idx_contract_signature_parties_signature_role
--   - idx_contract_signature_parties_unique_buyer_spouse (legado; substituído abaixo)
--   - idx_contract_signature_parties_unique_vendor_cpf
--   - idx_contract_signature_parties_token_hash

-- Preview ainda pode ter a UNIQUE antiga; Production já não tem.
ALTER TABLE public.contract_signature_parties
  DROP CONSTRAINT IF EXISTS contract_signature_parties_unique_role;

ALTER TABLE public.contract_signature_parties
  DROP CONSTRAINT IF EXISTS contract_signature_parties_role_check;

ALTER TABLE public.contract_signature_parties
  ADD CONSTRAINT contract_signature_parties_role_check
  CHECK (
    role IN (
      'BUYER',
      'SPOUSE',
      'VENDOR',
      'INTERVENIENT',
      'WITNESS_1',
      'WITNESS_2'
    )
  );

-- Singleton por processo: 1 BUYER, 1 SPOUSE, 1 INTERVENIENT, 1 WITNESS_1, 1 WITNESS_2.
-- VENDOR permanece fora deste índice (múltiplos PF no ARAGUAIA).
-- Rename limpo: o nome buyer_spouse ficou estreito após incluir INTERVENIENT/WITNESS_*.
DROP INDEX IF EXISTS public.idx_contract_signature_parties_unique_buyer_spouse;
DROP INDEX IF EXISTS public.idx_contract_signature_parties_unique_singleton_roles;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_signature_parties_unique_singleton_roles
  ON public.contract_signature_parties (contract_signature_id, role)
  WHERE role IN (
    'BUYER',
    'SPOUSE',
    'INTERVENIENT',
    'WITNESS_1',
    'WITNESS_2'
  );

-- Preserva o mecanismo de 2 VENDOR. IF NOT EXISTS = no-op se já existir.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_signature_parties_unique_vendor_cpf
  ON public.contract_signature_parties (contract_signature_id, signer_cpf)
  WHERE role = 'VENDOR' AND signer_cpf IS NOT NULL;

-- Índice auxiliar (já existe em Production). Não unique.
CREATE INDEX IF NOT EXISTS idx_contract_signature_parties_signature_role
  ON public.contract_signature_parties (contract_signature_id, role);

COMMENT ON CONSTRAINT contract_signature_parties_role_check
  ON public.contract_signature_parties IS
  'BUYER/SPOUSE/VENDOR globais; INTERVENIENT/WITNESS_1/WITNESS_2 para ARAGUAIA e-sign V2. SPOUSE permanece válido para outros modelos.';

COMMENT ON TABLE public.contract_signature_parties IS
  'Participantes individuais (BUYER/SPOUSE/VENDOR/INTERVENIENT/WITNESS_1/WITNESS_2) de um processo contract_signatures. VENDOR pode repetir no mesmo processo (CPF distinto).';

NOTIFY pgrst, 'reload schema';


-- Preserva o mecanismo de 2 VENDOR. IF NOT EXISTS = no-op em Production.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_signature_parties_unique_vendor_cpf
  ON public.contract_signature_parties (contract_signature_id, signer_cpf)
  WHERE role = 'VENDOR' AND signer_cpf IS NOT NULL;

-- Índice auxiliar (já existe em Production). Não unique.
CREATE INDEX IF NOT EXISTS idx_contract_signature_parties_signature_role
  ON public.contract_signature_parties (contract_signature_id, role);

COMMENT ON CONSTRAINT contract_signature_parties_role_check
  ON public.contract_signature_parties IS
  'BUYER/SPOUSE/VENDOR globais; INTERVENIENT/WITNESS_1/WITNESS_2 para ARAGUAIA e-sign V2. SPOUSE permanece válido para outros modelos.';

COMMENT ON TABLE public.contract_signature_parties IS
  'Participantes individuais (BUYER/SPOUSE/VENDOR/INTERVENIENT/WITNESS_1/WITNESS_2) de um processo contract_signatures. VENDOR pode repetir no mesmo processo (CPF distinto).';

NOTIFY pgrst, 'reload schema';
