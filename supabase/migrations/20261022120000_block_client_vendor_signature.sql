-- SV LOTES — Fase 3: impede authenticated/anon de concluir assinatura do VENDEDOR.
-- service_role (POST sign-vendor e POST /api/sign/sale/[token]) continua permitido.
-- NÃO bloqueia BUYER / SPOUSE / WITNESS / INTERVENIENT no link público (service role).

CREATE OR REPLACE FUNCTION public.contract_signature_parties_block_client_vendor_signed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
  party_role text;
BEGIN
  jwt_role := COALESCE(auth.role(), '');

  IF jwt_role NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  party_role := upper(trim(COALESCE(NEW.role, OLD.role, '')));
  IF party_role <> 'VENDOR' THEN
    RETURN NEW;
  END IF;

  IF (upper(trim(COALESCE(NEW.status, ''))) = 'SIGNED'
      AND upper(trim(COALESCE(OLD.status, ''))) IS DISTINCT FROM 'SIGNED')
     OR (NEW.signed_at IS NOT NULL AND OLD.signed_at IS NULL)
     OR (
       COALESCE(NEW.signature_hash, '') <> ''
       AND COALESCE(OLD.signature_hash, '') = ''
     )
  THEN
    RAISE EXCEPTION
      'Assinatura do vendedor pelo painel exige autorização do Administrador Principal.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_signature_parties_block_client_vendor_signed
  ON public.contract_signature_parties;
CREATE TRIGGER contract_signature_parties_block_client_vendor_signed
  BEFORE UPDATE ON public.contract_signature_parties
  FOR EACH ROW
  EXECUTE PROCEDURE public.contract_signature_parties_block_client_vendor_signed();

COMMENT ON FUNCTION public.contract_signature_parties_block_client_vendor_signed() IS
  'Impede que o browser marque party VENDOR como SIGNED. service_role (painel autorizado e link público) não é bloqueado.';

CREATE OR REPLACE FUNCTION public.contract_signatures_block_client_vendor_signed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  jwt_role text;
BEGIN
  jwt_role := COALESCE(auth.role(), '');

  IF jwt_role NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF (NEW.vendor_signed_at IS NOT NULL AND OLD.vendor_signed_at IS NULL)
     OR (
       COALESCE(NEW.vendor_signature_hash, '') <> ''
       AND COALESCE(OLD.vendor_signature_hash, '') = ''
     )
     OR (
       upper(trim(COALESCE(NEW.signature_status, ''))) = 'SIGNED'
       AND upper(trim(COALESCE(OLD.signature_status, ''))) IS DISTINCT FROM 'SIGNED'
     )
  THEN
    RAISE EXCEPTION
      'Assinatura do vendedor pelo painel exige autorização do Administrador Principal.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_signatures_block_client_vendor_signed
  ON public.contract_signatures;
CREATE TRIGGER contract_signatures_block_client_vendor_signed
  BEFORE UPDATE ON public.contract_signatures
  FOR EACH ROW
  EXECUTE PROCEDURE public.contract_signatures_block_client_vendor_signed();

COMMENT ON FUNCTION public.contract_signatures_block_client_vendor_signed() IS
  'Impede vendor_signed_at / signature_status SIGNED via client. service_role permanece permitido.';

NOTIFY pgrst, 'reload schema';
