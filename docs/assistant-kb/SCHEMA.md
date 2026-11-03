# Schema da base oficial do Assistente SV

Conhecimento operacional versionado no repositório. Não treinar modelo.
Não despejar este diretório inteiro no prompt de um LLM (Fase 1B).

## Arquivo de procedimento (`*.json`)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | string | sim | Identificador estável (`modulo-fluxo`) |
| `title` | string | sim | Título operacional |
| `module` | string | sim | `gis`, `customers`, `brokers`, `contracts`, `finance`, `charges`, `split`, `settings` |
| `routes` | string[] | sim | Rotas da UI (`/map`, `/contracts`, …) |
| `profiles` | string[] | sim | Papéis que podem **receber** a orientação |
| `access` | `"read"` \| `"write"` | sim | OWNER nunca recebe `write` |
| `tags` | string[] | sim | Palavras para retrieval |
| `objective` | string | sim | O que a operação faz |
| `prerequisites` | string[] | sim | Condições antes de começar |
| `navigationPath` | string[] | sim | Caminho com rótulos reais da UI |
| `steps` | string[] | sim | Passos numerados |
| `expectedResult` | string | sim | Resultado no sistema |
| `commonErrors` | string[] | sim | Falhas frequentes |
| `limitations` | string[] | sim | O que o assistente / o fluxo não faz |
| `modelDifferences` | `{ models: string[], note: string }[]` | sim | `PADRAO`, `RECANTO_PRIMAVERA`, `ESTRELA_DO_SUL`, `MUNDO_NOVO`, … |
| `sourceOfTruth` | string[] | sim | Arquivos de código que sustentam os rótulos |
| `uiLabels` | string[] | sim | Rótulos que devem existir nesses arquivos (teste de deriva) |
| `contractModels` | string[] | não | Restringe retrieval quando o contexto tem modelo |

## Regras

1. Usar somente nomes de botão/tela encontrados no código.
2. Se não houver informação confirmada, o assistente responde a recusa oficial — nunca inventa UI.
3. O assistente é 100% orientativo: não cria venda, reserva, cobrança, baixa, assinatura, Split nem altera configuração.
4. Mundo Novo: vendedores vêm de `projects.seller_parties_json`. A UI do empreendimento só mantém e-mail e telefone/WhatsApp dos já definidos.
5. LF Imóveis: chave interna `ESTRELA_DO_SUL`; rótulo de UI **LF Imóveis**. Split de Recebimentos ≠ percentuais contratuais 40/60.
6. Ao criar funcionalidade nova no SV Lotes, atualizar o procedimento correspondente neste diretório.

## Fase 1B

`lib/assistant/ask.ts` é o orquestrador. A rota futura `POST /api/assistant/ask` deve chamá-lo após autenticar a sessão, sem enviar PII, JWT ou secrets ao modelo.
