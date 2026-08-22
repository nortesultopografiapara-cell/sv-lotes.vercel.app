# SV LOTES — ambiente DEVELOP (homologação)

Production é área protegida. Este documento descreve somente o banco separado de homologação.

## Identidade

| Ambiente | Project Ref | Host |
|---|---|---|
| DEVELOP | `hoynysmynxncdlptuzub` | `hoynysmynxncdlptuzub.supabase.co` |
| PRODUCTION | `aezktedncttwpqeunjej` | `aezktedncttwpqeunjej.supabase.co` |

O clone anterior `zumwvcxgrpxggyxomzic` **não** autoriza escrita de homologação.

Vercel:

- `main` / Production → Supabase Production
- `develop` / Preview → Supabase DEVELOP

## Guards

Todo script de escrita deve abortar se:

1. host = Production; ou
2. branch = `main`; ou
3. Project Ref ≠ `hoynysmynxncdlptuzub`; ou
4. o arquivo for `20261008120000_sale_contract_operations.sql`

```bash
npx tsx scripts/develop/assert-target.ts
npx tsx scripts/develop/audit-migrations.ts
```

Credenciais locais (gitignored):

- `.env.develop.apply` — `NEXT_PUBLIC_SUPABASE_URL`, anon e **service role** do DEVELOP
- Nunca copiar Auth users, PII ou Storage objects de Production

## Schema

Não replayar as ~150 migrations históricas. Preferir dump **schema-only** de Production e aplicar somente em DEVELOP.

Pendência típica: senha Postgres ou `SUPABASE_SERVICE_ROLE_KEY` do DEVELOP (o `vercel env pull` redige Sensitive e a API de decrypt devolve vazio neste token).

## Auth (DEVELOP)

Usuários fictícios (não copiar Production):

| Papel | E-mail |
|---|---|
| SUPER_ADMIN | `super.admin.homolog@svlotes.test` |
| ADMIN empresa A | `admin.empresa-a.homolog@svlotes.test` |
| OWNER empresa A | `owner.empresa-a.homolog@svlotes.test` |
| ADMIN empresa B | `admin.empresa-b.homolog@svlotes.test` |

Senha padrão de homologação (somente DEVELOP): `Homologacao!2026`

Redirect URLs do Auth DEVELOP — Preview da branch `develop`, **não** `www.svlotes.com.br`.

## Storage

Buckets vazios esperados: `sale-documents`, `company-assets`, `company-exports`, `legacy-contracts`.

## Seed

```bash
npx tsx scripts/develop/seed-homolog.ts
npx tsx scripts/develop/bootstrap-storage.ts
```

Empresas: `SV LOTES HOMOLOGAÇÃO A` e `SV LOTES HOMOLOGAÇÃO B`.
Projeto GIS: `LOTEAMENTO HOMOLOGAÇÃO`, quadra `01`, lotes 01–05.

## Integrações externas

No DEVELOP, Resend / Z-API / Asaas / Inter são no-op (guard por Project Ref). Production não muda.

## Migration nova

`supabase/migrations/20261008120000_sale_contract_operations.sql` **não** entra nesta etapa.
