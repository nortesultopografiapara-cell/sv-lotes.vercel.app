# Portal do Cliente — Estudo Técnico e Roadmap

**Status:** Etapa 1 em `develop` (esqueleto + landing + tela estática).  
**Escopo:** área pública **somente leitura**. Não altera financeiro, Asaas, contratos, assinaturas, vendas nem cadastro de clientes.

---

## 1. Fluxo oficial do MVP (aprovado)

```
Landing → /portal-cliente
  → Cliente informa CPF/CNPJ
  → Sistema localiza vínculos do documento (cross-tenant)
  → OTP de 6 dígitos enviado ao WhatsApp cadastrado
  → Cliente informa o código no portal
  → Sessão curta liberada → painel somente leitura
```

### Regras de autenticação

| Regra | Detalhe |
|-------|---------|
| CPF/CNPJ sozinho | **Nunca** libera acesso |
| Canal principal | **WhatsApp** (Z-API, telefone em `customers.phone`) |
| E-mail | Fallback futuro, se não houver telefone |
| Antes do OTP | Apenas dados **mascarados** (empresa, empreendimento, quadra/lote) |
| OTP | 6 dígitos, validade **5 minutos**, hash no servidor |
| Tentativas | Limitadas por IP + documento (anti-abuso) |
| Sessão | Cookie **httpOnly**, **Secure**, **SameSite**; TTL sugerido 30–45 min |

### Dados exibidos após OTP (read-only)

- Nome do cliente, empresa/loteadora, empreendimento, quadra/lote
- Contrato e status de assinatura
- Link para assinar (se pendente) — reutiliza `/sign/sale/[token]` existente
- Parcelas pagas, em aberto e vencidas
- Links de boleto/PIX **já existentes** em `company_asaas_charges`
- Recibos/comprovantes — fase 2

---

## 2. Arquitetura (módulo isolado)

```
app/portal-cliente/              # páginas públicas
app/api/portal-cliente/          # APIs futuras (lookup, OTP, dashboard)
lib/portal-cliente/              # config, lookup, OTP, sessão, dashboard
components/portal-cliente/         # UI do portal
docs/CLIENT_PORTAL.md              # este documento
```

**Princípio:** zero imports de escrita em `asaasCompanyChargeService`, fluxos de assinatura ou APIs financeiras internas.

---

## 3. Feature flag

| Variável | Uso |
|----------|-----|
| `CLIENT_PORTAL_ENABLED` | Gate server (APIs, RSC) |
| `NEXT_PUBLIC_CLIENT_PORTAL_ENABLED` | Gate UI (landing, página) |

Desativado por padrão. Em `develop`/preview, definir ambos como `true` para testar.

---

## 4. Rotas

### Páginas (MVP)

| Rota | Etapa | Função |
|------|-------|--------|
| `/portal-cliente` | **1** ✓ | CPF/CNPJ (estática) |
| `/portal-cliente/verificar` | 3 | Input OTP |
| `/portal-cliente/vinculos` | 2 | Seleção de vínculo (se múltiplos) |
| `/portal-cliente/painel` | 4 | Dashboard read-only |

### APIs (futuras)

| Método | Rota | Função |
|--------|------|--------|
| POST | `/api/portal-cliente/lookup` | Vínculos mascarados por CPF |
| POST | `/api/portal-cliente/send-code` | Envia OTP WhatsApp |
| POST | `/api/portal-cliente/verify` | Valida OTP → sessão |
| GET | `/api/portal-cliente/dashboard` | Dados do painel |
| POST | `/api/portal-cliente/logout` | Encerra sessão |

### Middleware e Layout

- `middleware.ts`: `/portal-cliente` e `/api/portal-cliente` em rotas públicas
- `Layout.tsx`: `isPublicStandalone` inclui `/portal-cliente`

---

## 5. Tabelas consultadas (somente SELECT)

| Tabela | Uso |
|--------|-----|
| `customers` | Documento, telefone (OTP), nome |
| `companies` | Nome da loteadora |
| `sales` | Vínculo compra |
| `projects` | Empreendimento |
| `blocks` | Quadra/lote |
| `contracts` | Número e status |
| `contract_signatures` | Assinatura e link público |
| `finance_receipts` | Parcelas |
| `company_asaas_charges` | Links PIX/boleto existentes |

### Tabelas novas (futuras)

- `client_portal_otp_codes` — código hash, expiração, tentativas
- `client_portal_sessions` — opcional, se não usar JWT assinado

---

## 6. Isolamento multi-tenant

1. Lookup inicial: busca global por documento normalizado; retorno **mascarado**
2. Após OTP: sessão amarrada a **um** `customer_id` + `company_id`
3. Dashboard: `WHERE customer_id = $session AND company_id = $session`
4. APIs do portal: service role server-side; anon não acessa tabelas diretamente
5. Resposta genérica se CPF não existir (anti-enumeração)

**Atenção:** validar em produção constraint `customers.cpf_cnpj` — migration antiga tinha `UNIQUE` global; o mesmo CPF em tenants diferentes pode exigir `UNIQUE(tenant_id, cpf_cnpj)`.

---

## 7. Riscos de segurança

| Risco | Mitigação |
|-------|-----------|
| Enumeração de CPF | Mensagem genérica; rate limit; CAPTCHA após N tentativas |
| OTP interceptado | TTL 5 min; hash no banco; máx. 3 tentativas |
| Sessão roubada | httpOnly + Secure + SameSite; TTL curto |
| Cross-tenant leak | Filtro obrigatório por `customer_id` da sessão |
| Expor links de pagamento | Somente após OTP validado |
| LGPD | Política de privacidade; logs mínimos |

---

## 8. Plano de implementação

### Etapa 1 — Esqueleto (`develop`) ✓

- [x] Botão na landing (`LandingHeader`)
- [x] Rota `/portal-cliente` pública
- [x] Tela estática CPF/CNPJ
- [x] Feature flag `CLIENT_PORTAL_ENABLED`
- [ ] Lookup real
- [ ] OTP WhatsApp
- [ ] Painel read-only

### Etapa 2 — Lookup cross-tenant ✓

- [x] `POST /api/portal-cliente/lookup`
- [x] `lib/clientPortalLookup.ts` (isolado)
- [x] Dados mascarados (nome, telefone)
- [x] Lista de vínculos múltiplos
- [ ] OTP WhatsApp
- [ ] Painel read-only

### Etapa 3 — OTP + sessão

- Tabela `client_portal_otp_codes`
- Integração Z-API (`lib/whatsapp/zapiProvider.ts`)
- `send-code` + `verify`
- Cookie de sessão

### Etapa 4 — Painel read-only

- `GET /api/portal-cliente/dashboard`
- Contrato, assinatura, parcelas, links existentes

### Etapa 5 — Piloto e hardening

- Whitelist `CLIENT_PORTAL_ALLOWED_COMPANY_IDS`
- Testes E2E; auditoria LGPD

### Etapa 6 — Produção

- Merge `develop` → `main` somente após aprovação explícita

---

## 9. Como evitar regressão

1. Feature flag desligada por padrão em produção
2. Módulo em `lib/portal-cliente/` e `app/portal-cliente/` — sem alterar módulos existentes
3. Apenas `SELECT` nas queries do portal
4. Não chamar POST de Asaas, assinatura ou financeiro
5. Link de assinatura: apenas exibir URL existente (`buildSaleSignUrl`)
6. Desenvolvimento exclusivo em `develop` até piloto aprovado

---

## 10. Testes obrigatórios

Script: `scripts/mandatory-client-portal-stage1-tests.ts`

| Teste | Valida |
|-------|--------|
| Feature flag parse | `true`/`false` |
| Rota em middleware | `/portal-cliente` público |
| Landing path configurado | `LANDING_CLIENT_PORTAL_PATH` |
| Flag off → página 404 | Regressão |
| Sem APIs de escrita no módulo | Read-only futuro |

Testes futuros (Etapas 2–4): isolamento tenant, OTP expirado, anti-enumeração, dashboard sem campos internos.

---

## 11. Variáveis de ambiente

```env
CLIENT_PORTAL_ENABLED=false
NEXT_PUBLIC_CLIENT_PORTAL_ENABLED=false
# Futuras:
# CLIENT_PORTAL_SESSION_SECRET=
# CLIENT_PORTAL_OTP_TTL_MINUTES=5
# CLIENT_PORTAL_SESSION_TTL_MINUTES=45
# CLIENT_PORTAL_ALLOWED_COMPANY_IDS=
```

---

## 12. Landing

Botão **Portal do Cliente** entre **Agendar Demonstração** e **Acessar Sistema** em `components/landing/LandingHeader.tsx`, visível quando `NEXT_PUBLIC_CLIENT_PORTAL_ENABLED=true`.

Constante: `LANDING_CLIENT_PORTAL_PATH` em `components/landing/constants/landingConfig.ts`.
