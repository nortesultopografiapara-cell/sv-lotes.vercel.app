# Receptor mTLS — Webhook Banco Inter (SV LOTES Fase C)

Serviço **dedicado** (fora da Vercel) que:

1. Aceita HTTPS com **mTLS** (`requestCert: true`, `ca: ca.crt` do Inter)
2. Rejeita handshake/certificado desconhecido
3. Encaminha o payload ao SV LOTES com **HMAC-SHA256**

## Hospedagem recomendada

| Opção | Notas |
|-------|--------|
| **Fly.io** | Suporta TCP/HTTPS + volumes/secrets; bom custo baixo |
| **Railway / Render** | Possível com TLS custom; verificar mTLS client cert |
| **VM (Oracle/AWS Lightsail)** | Nginx/Node com controle total do TLS |

**Não** hospedar este receptor na Vercel (TLS edge não expõe client cert).

## Variáveis de ambiente

| Var | Uso |
|-----|-----|
| `INTER_WEBHOOK_CA_PATH` ou `INTER_WEBHOOK_CA_PEM` | **ca.crt** (Certificado Webhook do Inter) — trust anchor |
| `TLS_CERT_PATH` / `TLS_CERT_PEM` | Certificado do **domínio do receptor** (Let's Encrypt / ZeroSSL — CA pública) |
| `TLS_KEY_PATH` / `TLS_KEY_PEM` | Chave do domínio do receptor |
| `SV_LOTES_INTERNAL_WEBHOOK_URL` | `https://<app>/api/finance/inter/webhook/internal` |
| `INTER_WEBHOOK_HMAC_SECRET` | Segredo compartilhado com o SV LOTES |
| `PORT` | Default `8443` |

No **SV LOTES** (Vercel env):

| Var | Uso |
|-----|-----|
| `INTER_WEBHOOK_HMAC_SECRET` | Mesmo segredo |
| `INTER_WEBHOOK_RECEIVER_PUBLIC_URL` | Ex.: `https://inter-webhook.seudominio.com` |

## URL cadastrada no Inter

```
https://<RECEIVER_HOST>/webhook/<COMPANY_UUID>
```

## Segurança

- `ca.crt` **somente** no receptor (nunca no formulário financeiro da UI)
- Não misturar com certificado/chave API OAuth
- Não logar PEM nem payload completo
- SV LOTES rejeita POST interno sem HMAC / replay

## Rodar local

```bash
cd services/inter-webhook-receiver
npm test
# configurar env + certificados, depois:
npm start
```

## Custos (ordem de grandeza)

- Fly.io shared / VM pequena: tipicamente **US$ 3–7/mês**
- Domínio + Let's Encrypt: **US$ 0**
- Sem custo adicional de Vercel Function para validar mTLS
