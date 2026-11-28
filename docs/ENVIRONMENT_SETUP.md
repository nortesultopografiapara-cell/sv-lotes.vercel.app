# SV LOTES — configuração permanente dos ambientes

Este documento não contém chaves, tokens nem senhas. Os identificadores abaixo são os projetos oficiais.

## Projetos

| Ambiente | Project ref | Uso |
|---|---|---|
| Production | `aezktedncttwpqeunjej` | Somente Vercel Production |
| Develop | `hoynysmynxncdlptuzub` | Preview geral e Development |
| Aposentado | `zumwvcxgrpxggyxomzic` | Proibido. Não usar em variável, arquivo ou script |

## Variáveis

| Nome | Onde vive | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente e servidor | A URL identifica o projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente e servidor | Papel `anon`, ou formato `sb_publishable_` |
| `SUPABASE_SERVICE_ROLE_KEY` | Somente servidor | Papel `service_role`, ou formato `sb_secret_`. Nunca `NEXT_PUBLIC_` |

O marcador `[SENSITIVE]` não é credencial. Variável Sensitive da Vercel não deve ser rebaixada para o CLI conseguir lê-la.

## Precedência na Vercel

Para o mesmo nome, vale nesta ordem:

1. Preview com a branch Git exata.
2. Production, Preview ou Development, sem branch.
3. Variável compartilhada da equipe, se o projeto não definir o nome.
4. Variáveis de sistema, como `VERCEL_ENV`.

A cópia de uma branch substitui só aquele nome. Branch nova, sem cópia própria, recebe o Preview geral. Não cadastrar `SUPABASE_SERVICE_ROLE_KEY` de novo para cada branch.

## Vercel — o que já permanece

Production e Preview geral já estão preenchidos. Não alterar e não apagar.

O Preview geral já aponta para `hoynysmynxncdlptuzub`.

Development ainda não tem as três variáveis. Quem preenche é o administrador principal, no painel, uma única vez.

## Painel da Vercel — Development

Projeto: `sv-lotes-vercel-app`.

Em Settings → Environment Variables, criar três entradas. Em cada uma:

- Environments: somente Development.
- Git branch: em branco. Não marcar branch.
- Production e Preview: desmarcados.
- Tipo: Sensitive para as duas chaves. A URL pode ficar visível, porque só identifica o projeto.

Valores, copiados do projeto Supabase `hoynysmynxncdlptuzub`, em Project Settings → API Keys:

| Campo na Vercel | Origem no Supabase Develop |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret |

Não usar as chaves de `aezktedncttwpqeunjej`. Não usar `zumwvcxgrpxggyxomzic`. Não colar valor neste repositório nem no chat.

`vercel env pull` baixa Development. Se a chave estiver Sensitive, o arquivo local recebe `[SENSITIVE]` e o validador recusa. O pull não substitui o armazenamento local descrito abaixo.

## Worktree nova

Na máquina do administrador, uma vez:

```powershell
.\scripts\env\Store-DevelopCredentials.ps1
```

O prompt local pede as três variáveis do Develop. Os caracteres não aparecem. O script valida o projeto e grava no Gerenciador de Credenciais do Windows, com persistência local, sem roaming. Production é recusada.

Para cada worktree:

```powershell
.\scripts\env\Initialize-SvLotesWorktree.ps1 -Worktree "D:\caminho\da\worktree"
```

O script valida de novo, inclusive com uma leitura autenticada em `/rest/v1/` do projeto esperado, e só então escreve `.env.local`. O arquivo fica ignorado pelo Git e com permissão só para o usuário atual. Outras linhas do `.env.local`, como `VERCEL_OIDC_TOKEN`, são preservadas.

Se URL, anon key ou service role já tiverem valor real, o script para e não sobrescreve. Para substituir:

```powershell
.\scripts\env\Initialize-SvLotesWorktree.ps1 -Worktree "D:\caminho\da\worktree" -AllowOverwrite
```

Não usar `.env.develop.apply` nem `.env.develop.apply.env` como fonte.

## Validação

Biblioteca: `lib/security/supabaseProjectGuard.ts`.

Comando:

```powershell
node .\node_modules\tsx\dist\cli.mjs .\scripts\env\validate-supabase-project.ts
```

Regras:

- Production (`VERCEL_ENV=production`) aceita só `aezktedncttwpqeunjej`.
- Preview e Development aceitam só `hoynysmynxncdlptuzub`.
- Ambiente desconhecido falha.
- URL pública, URL privada `SUPABASE_URL` quando existir, anon key e service role precisam ser o mesmo projeto.
- `zumwvcxgrpxggyxomzic` falha sempre.
- JWT legado: lê os claims `ref` e `role`. Isso não prova a assinatura.
- A prova complementar é `GET /rest/v1/` com a chave, no host do projeto esperado. A resposta não é gravada. Não há consulta a tabela de clientes, vendas ou financeiro.
- Chave `sb_publishable_` ou `sb_secret_` entra pelo prefixo. Sem o `ref` no valor, o cliente servidor só abre depois dessa leitura.
- O resultado fica em memória do processo. A leitura não se repete a cada requisição.
- O build na Vercel, com `VERCEL_ENV` igual a `preview` ou `production`, executa a mesma validação antes de concluir. Se o projeto não corresponder, o build falha e o deployment não fica disponível. No runtime, `instrumentation.ts` interrompe a subida do servidor nesses dois ambientes quando a validação falha. Build local, sem `VERCEL_ENV`, não exige as chaves.
- A service role não vai para o navegador.

`createServiceSupabase` e `createAdminSupabase` recusam cliente quando o projeto não corresponde ao ambiente. `createRouteHandlerSupabase` faz o mesmo para a URL pública e a anon key.

## Efeitos externos

O bloqueio pela URL do Develop continua.

Além dele, chamada real fica fechada quando o processo não é a Production da Vercel:

- `VERCEL_ENV=preview` ou `development`
- qualquer outro `VERCEL_ENV` diferente de `production`
- `NODE_ENV=development`, `test` ou `production` sem `VERCEL_ENV=production`

Isso cobre WhatsApp (Z-API), e-mail (Resend e lembrete SaaS), Asaas live, Banco Inter live e C6 live. Uma URL de Production colocada por engano no Preview não autoriza esses envios.

Sandbox permanece no caminho já existente:

- Asaas com ambiente sandbox
- Banco Inter sandbox
- C6 sandbox no host Develop

Os crons de `vercel.json` continuam agendados só em deployment de Production. OpenAI Ads não é ativado por esta configuração. Evento futuro de anúncio precisa passar pelo mesmo bloqueio de efeito real.

## Segurança

- Não commitar `.env.local` nem arquivo de pull. `.gitignore` usa `.env*`, com exceção de `.env.example`.
- Não documentar valor de chave.
- Não imprimir chave em log. O validador registra só o identificador do projeto e a mensagem.
- Não criar variável de Preview por branch sem necessidade comprovada.
- Não apontar Preview ou Development para Production.
- Não reduzir Sensitive para recuperar valor pelo CLI.

## Diagnóstico

| Mensagem | Causa | O que fazer |
|---|---|---|
| Service role não configurada | Falta URL ou service role | Rodar o script da worktree |
| Ambiente de execução desconhecido | `VERCEL_ENV` fora de production, preview e development, sem `NODE_ENV` de desenvolvimento | Corrigir o ambiente antes de usar o banco |
| aceita somente o projeto | URL de outro projeto | Trocar para o ref da tabela |
| Projeto Supabase aposentado bloqueado | `zumwvcxgrpxggyxomzic` | Descartar o arquivo antigo e usar o Develop atual |
| Chave incompatível com o papel | JWT com `role` trocado, formato inválido ou `[SENSITIVE]` | Colocar a chave do papel certo, vinda do painel do Supabase |
| URL e chaves apontam para projetos diferentes | Mistura Develop com Production | Refazer as três variáveis do mesmo projeto |
| A chave não foi aceita pelo projeto esperado | A leitura autenticada devolveu 401 ou 403 | A chave não pertence àquele host |
| Service role nova ainda sem confirmação | `sb_secret_` sem `ref`, antes da leitura | Deixar o processo concluir `instrumentation.ts` ou o script de validação |
| Operação externa bloqueada | Preview, Development ou URL Develop | Efeito real só na Production da Vercel. Sandbox continua pelo caminho próprio |

## Rotação

1. No Supabase do projeto certo, gerar a chave nova.
2. Na Vercel, atualizar só o ambiente correspondente: Production com Production, Development e Preview geral com Develop. Não criar entrada por branch.
3. Na máquina local, rodar `Store-DevelopCredentials.ps1` de novo e `Initialize-SvLotesWorktree.ps1 -AllowOverwrite` nas worktrees em uso.
4. Rodar o script de validação. O log deve mostrar o ref esperado e `probe` accepted, sem a chave.
5. Revogar a chave antiga só depois da validação. Não revogar no mesmo passo de um deploy ainda não conferido.

## Limpeza futura

Não apagar nesta etapa os arquivos locais antigos nem as variáveis de branch já existentes. A limpeza fica para uma autorização separada. Candidatos: cópias `.env.vercel.*`, `.env.prod.apply`, `.env.hotfix.*` e `.env.develop.apply.env` no disco das worktrees. O último pode apontar para o projeto aposentado.
