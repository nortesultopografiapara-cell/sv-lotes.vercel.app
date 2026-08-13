# SV LOTES — Receptor mTLS Webhook Inter (Fase C)

Documentação operacional. **Não publicar em produção sem autorização.**

## Arquitetura

```
Banco Inter
  --(mTLS + ca.crt)-->  Receptor dedicado (Fly/VM)
  --(HMAC-SHA256)---->  POST /api/finance/inter/webhook/internal
  --(OAuth+mTLS)----->  GET /cobranca/v3/cobrancas/{codigoSolicitacao}
  -------------------->  bank_charges + finance_receipts + cash_movements
```

Asaas permanece isolado.

## Hospedagem do receptor

Recomendado: **Fly.io** (ou VM pequena) em `services/inter-webhook-receiver`.

Custo estimado: **US$ 3–7/mês** + domínio.

## Env

### Receptor
- `INTER_WEBHOOK_CA_PATH` = caminho do **ca.crt** (Certificado Webhook)
- `TLS_CERT_PATH` / `TLS_KEY_PATH` = TLS do domínio do receptor (Let's Encrypt)
- `SV_LOTES_INTERNAL_WEBHOOK_URL`
- `INTER_WEBHOOK_HMAC_SECRET`

### SV LOTES (Vercel Preview)
- `INTER_WEBHOOK_HMAC_SECRET` (mesmo valor)
- `INTER_WEBHOOK_RECEIVER_PUBLIC_URL` = `https://inter-webhook.<dominio>`

## Homologação ponta a ponta

1. Deploy do receptor em ambiente controlado (não prod).
2. Configurar `ca.crt` + TLS do domínio.
3. Configurar env no Preview SV LOTES.
4. UI Inter → Testar conexão (Fase B).
5. UI Inter → Cadastrar webhook (PUT).
6. Emitir cobrança sandbox / forçar callback (quando emissão existir) **ou** retry de callback.
7. Confirmar: 1ª notificação baixa; 2ª é idempotente.

## Endpoints criados

| Endpoint | Papel |
|----------|--------|
| Receptor `POST /webhook/:companyId` | Público Inter (mTLS) |
| `POST /api/finance/inter/webhook/internal` | Interno HMAC |
| `GET/PUT/DELETE /api/banking/inter/webhook` | Cadastro no Inter |
