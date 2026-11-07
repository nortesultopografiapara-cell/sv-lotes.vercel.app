-- Gatilho da allowlist do sinal separado.
-- NÃO EXECUTAR sem autorização. Não altera o núcleo financeiro já aplicado.
-- Não altera a baixa manual, Asaas, Inter ou C6 Bank.
-- EMBEDDED e o modo nulo seguem livres. Nenhuma venda existente é reescrita.
-- CREATE TRIGGER segura public.sales só durante esta transação.
-- O par autorizado é o tenant e o empreendimento lidos no painel de Production.
-- Recanto Primavera I e qualquer outro projeto ficam de fora porque o id não é este.

CREATE OR REPLACE FUNCTION public.reject_unlisted_separate_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.signal_schedule_mode IS DISTINCT FROM 'SEPARATE' THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id = '06c7bd77-633f-45f7-8c80-f497c6006ce0'::uuid
     AND NEW.company_id IS NOT DISTINCT FROM NEW.tenant_id
     AND NEW.project_id = 'a6893672-257b-40b2-a0c2-fb7f48a404aa'::uuid
     AND EXISTS (
       SELECT 1
       FROM public.projects AS project
       WHERE project.id = NEW.project_id
         AND (
           lower(btrim(project.tenant_id::text)) = lower(NEW.tenant_id::text)
           OR lower(btrim(project.company_id::text)) = lower(NEW.tenant_id::text)
         )
     )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'SEPARATE_SIGNAL_NOT_ALLOWED:O parcelamento separado do sinal não está liberado para esta empresa e este empreendimento.';
END;
$$;

COMMENT ON FUNCTION public.reject_unlisted_separate_signal() IS
  'Recusa SEPARATE fora do tenant e do empreendimento autorizados. Exige company_id igual ao tenant e o projeto vinculado a essa empresa.';

DROP TRIGGER IF EXISTS sales_reject_unlisted_separate_signal ON public.sales;
CREATE TRIGGER sales_reject_unlisted_separate_signal
  BEFORE INSERT OR UPDATE OF signal_schedule_mode, tenant_id, company_id, project_id
  ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_unlisted_separate_signal();

REVOKE ALL ON FUNCTION public.reject_unlisted_separate_signal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_unlisted_separate_signal() FROM anon;
REVOKE ALL ON FUNCTION public.reject_unlisted_separate_signal() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_unlisted_separate_signal() TO service_role;

NOTIFY pgrst, 'reload schema';
