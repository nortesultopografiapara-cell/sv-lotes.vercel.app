# Receptor mTLS — Webhook Banco Inter (SV LOTES Fase C)

Serviço **dedicado** (fora da Vercel) que:

1. Aceita HTTPS com **mTLS** (`requestCert: true`, `ca: ca.crt` do Inter)
2. Rejeita handshake/certificado desconhecido
3. Encaminha o payload ao SV LOTES Preview com **HMAC-SHA256**

```
Inter → TCP:443 (Fly Proxy, sem TLS) → Node https mTLS → HMAC → SV LOTES /api/finance/inter/webhook/internal
```

## Por que Fly + TCP passthrough

Documentação oficial Fly ([TLS termination](https://fly.io/docs/security/tls-termination/), [Services](https://fly.io/docs/networking/services/)):

> If you want to terminate TLS yourself, then you only need to **remove the handlers** from your services… and we'll forward TCP directly to your app.

No `fly.toml` deste serviço: `handlers = []` na porta 443. O Node recebe o stream TLS intacto e valida o **client certificate** do Inter.

**Não** usar `handlers = ["tls"]` / `["tls","http"]` — isso termina TLS no Fly Proxy e o Node **não** vê o certificado cliente.

## Estrutura

```
services/inter-webhook-receiver/
  Dockerfile
  .dockerignore
  fly.toml
  package.json
  README.md
  src/server.js      # https.createServer mTLS
  src/hmac.js
  test/hmac.test.js
```

## Porta

| Camada | Porta |
|--------|-------|
| Pública (Internet → Fly) | **443** |
| Interna (Fly → Node) | **8443** (`PORT`) |
| Bind Node | `0.0.0.0:8443` |

## Health check

Com `rejectUnauthorized: true`, **todo** handshake HTTPS exige client cert válido (incluindo `GET /health`).

Por isso o Fly usa **`tcp_checks`** (abre TCP na 8443, sem HTTP/TLS). Isso **não** enfraquece `/webhook/:companyId`.

`GET /health` continua disponível só com mTLS (útil para smoke interno com cert de teste).

## Secrets (nunca no Git)

Preferir PEM via secrets (reconstruídos só em memória):

| Secret | Conteúdo |
|--------|----------|
| `INTER_WEBHOOK_CA_PEM` | Conteúdo do **ca.crt** (Certificado Webhook Inter) |
| `TLS_CERT_PEM` | Certificado do **domínio do receptor** (cadeia pública) |
| `TLS_KEY_PEM` | Private key do domínio do receptor |
| `SV_LOTES_INTERNAL_WEBHOOK_URL` | URL interna do Preview (abaixo) |
| `INTER_WEBHOOK_HMAC_SECRET` | Mesmo valor do env Vercel Preview |

Paths (`*_PATH`) só para desenvolvimento local.

### Destino SV LOTES Preview (atual)

```
https://sv-lotes-vercel-czimtdkpt.vercel.app/api/finance/inter/webhook/internal
```

Confirme no dashboard Vercel se este Preview ainda é o da branch `preview/inter-oauth-fase-b` antes do `fly secrets set`.

No **Vercel Preview** (não production):

| Env | Valor |
|-----|--------|
| `INTER_WEBHOOK_HMAC_SECRET` | Mesmo do Fly |
| `INTER_WEBHOOK_RECEIVER_PUBLIC_URL` | `https://<host-do-receiver>` (sem path) |

## fly.dev vs domínio próprio

| Host | Serve para webhook Inter? |
|------|---------------------------|
| `*.fly.dev` | **Não recomendado / praticamente inviável** com esta arquitetura. TLS termina no **Node**; precisamos de `TLS_CERT_PEM`/`TLS_KEY_PEM` com CN/SAN do hostname. Certificados gerenciados pelo Fly Proxy **não** são exportados para o app. Let's Encrypt em `*.fly.dev` não é controlado por nós. |
| `inter-webhook.svlotes.com.br` | **Recomendado** para cadastro no Inter. Emitir cert (ex.: DNS-01 Let's Encrypt), colocar PEM nos secrets. DNS **ainda não** nesta etapa. |

Para testes de conectividade TCP no Fly antes do domínio, pode-se usar cert autoassinado **só** em laboratório — o Inter **não** aceitará isso em produção/sandbox oficial.

## Segurança

- Não logar payload Inter integral, CA, TLS key nem HMAC secret
- Client cert inválido → handshake rejeitado
- Segunda etapa: HMAC + anti-replay no SV LOTES
- Não misturar `ca.crt` com cert/key OAuth API Inter
- Asaas intocado

## URL cadastrada no Inter (depois do deploy + domínio)

```
https://inter-webhook.svlotes.com.br/webhook/<COMPANY_UUID>
```

(ou o host final acordado)

## Comandos Fly (NÃO executar até autorização)

### 1) Instalar / login

```powershell
# Windows (PowerShell) — instalar flyctl
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

fly version
fly auth login
```

### 2) Ir ao diretório do receiver

```powershell
cd "d:\SV LOTE SISTEMA\sv-lotes.vercel.app\services\inter-webhook-receiver"
```

### 3) Launch (cria app; não sobrescrever fly.toml sem revisar)

```powershell
# Se o app ainda não existe:
fly launch --no-deploy --name sv-lotes-inter-webhook --region gru --copy-config

# Se já existe e só vai atualizar:
# (pular launch)
```

Garantir IPv4 público:

```powershell
fly ips list -a sv-lotes-inter-webhook
# Se não houver v4:
fly ips allocate-v4 -a sv-lotes-inter-webhook
```

### 4) Secrets

PowerShell — cuidado com `\n` nos PEMs. Preferir ler arquivo e passar:

```powershell
# Exemplo: carregar PEM de arquivo local (não commitar) e setar secret
$ca = Get-Content -Raw .\secrets\ca.crt
$cert = Get-Content -Raw .\secrets\fullchain.pem
$key = Get-Content -Raw .\secrets\privkey.pem

fly secrets set `
  INTER_WEBHOOK_CA_PEM="$ca" `
  TLS_CERT_PEM="$cert" `
  TLS_KEY_PEM="$key" `
  SV_LOTES_INTERNAL_WEBHOOK_URL="https://sv-lotes-vercel-czimtdkpt.vercel.app/api/finance/inter/webhook/internal" `
  INTER_WEBHOOK_HMAC_SECRET="COLOQUE_O_MESMO_SECRET_DO_PREVIEW" `
  -a sv-lotes-inter-webhook
```

Alternativa POSIX / Git Bash:

```bash
fly secrets set \
  INTER_WEBHOOK_CA_PEM="$(cat secrets/ca.crt)" \
  TLS_CERT_PEM="$(cat secrets/fullchain.pem)" \
  TLS_KEY_PEM="$(cat secrets/privkey.pem)" \
  SV_LOTES_INTERNAL_WEBHOOK_URL="https://sv-lotes-vercel-czimtdkpt.vercel.app/api/finance/inter/webhook/internal" \
  INTER_WEBHOOK_HMAC_SECRET="COLOQUE_O_MESMO_SECRET_DO_PREVIEW" \
  -a sv-lotes-inter-webhook
```

### 5) Deploy (somente após sua autorização)

```powershell
fly deploy -a sv-lotes-inter-webhook
fly status -a sv-lotes-inter-webhook
fly logs -a sv-lotes-inter-webhook
```

### 6) Validar mTLS depois do deploy

**A) Sem client cert (deve falhar no handshake):**

```powershell
curl.exe -vk https://sv-lotes-inter-webhook.fly.dev/health
# Esperado: erro de certificado cliente / handshake failure
```

**B) Com client cert de teste assinado pela CA do Inter (se disponível em lab):**

```powershell
curl.exe -vk --cacert secrets\ca.crt --cert client.crt --key client.key `
  https://<HOST>/health
# Esperado: {"ok":true,"service":"inter-webhook-receiver"}
```

**C) Webhook path sem cert:**

```powershell
curl.exe -vk -X POST https://<HOST>/webhook/<COMPANY_UUID> -H "Content-Type: application/json" -d "{}"
# Esperado: falha mTLS
```

**D) Ponta a ponta:** cadastrar no Inter (UI SV LOTES Preview) a URL  
`https://<HOST>/webhook/<COMPANY_UUID>` e emitir cobrança de teste (Fase D).

## Rodar local

```bash
cd services/inter-webhook-receiver
npm test
# exportar PEMs ou *_PATH, depois:
npm start
```

## Custos (ordem de grandeza)

- Fly shared-cpu-1x 256MB always-on: tipicamente poucos US$/mês
- Domínio + Let's Encrypt DNS-01: US$ 0
- Sem custo Vercel Function para mTLS
