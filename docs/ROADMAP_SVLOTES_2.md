# Roadmap — SV LOTES 2.0

Documento de planejamento estratégico para evolução do SV LOTES.  
Desenvolvimento na branch `develop` · Produção exclusiva na branch `main`.

---

## 1. Estrutura segura de desenvolvimento

| Ambiente | Branch | Uso |
|----------|--------|-----|
| Desenvolvimento / testes | `develop` | Novas funcionalidades, integrações e refatorações |
| Produção | `main` | Apenas versões validadas e estáveis |

### Fluxo de branches

```
develop  →  Preview Vercel (testes internos)
    ↓
  PR validado
    ↓
  main     →  sv-lotes.vercel.app (produção)
```

### Preview Vercel

- Cada push em `develop` gera um **Preview Deployment** automático.
- URL exclusiva por commit — ideal para validação antes do merge.
- Nunca usar preview como ambiente de produção.

### Checklist antes de merge (`develop` → `main`)

- [ ] `npx next build` concluído sem erros
- [ ] TypeScript validado
- [ ] Funcionalidade testada no Preview Vercel
- [ ] Impacto avaliado em: GIS, Contratos, Financeiro, Memorial, Pranchas PDF
- [ ] Migrations Supabase revisadas e aplicáveis
- [ ] Sem funcionalidade incompleta ou feature flag oculta
- [ ] Documentação atualizada (se aplicável)
- [ ] PR revisado e aprovado

---

## 2. Integração bancária

Objetivo: permitir que cada empresa cadastre seu banco e automatize cobrança e baixa de parcelas.

### Cadastro de banco por empresa

- Configuração independente por tenant (multi-empresa)
- Credenciais e certificados armazenados de forma segura
- Ambiente sandbox e produção por banco

### Bancos previstos (fase 1)

| Banco | Prioridade |
|-------|------------|
| Sicoob | Alta |
| Sicredi | Alta |
| Bradesco | Média |
| Banco do Brasil | Média |
| Caixa Econômica Federal | Média |

### Funcionalidades

- **Geração de boleto** — emissão vinculada à parcela do contrato
- **QR Code Pix** — cobrança instantânea com identificação da parcela
- **Retorno / webhook bancário** — confirmação automática de pagamento
- **Baixa automática de parcelas** — atualização de status, recibo e fluxo de caixa

### Integração com módulos existentes

- Contratos → parcelas → financeiro (regra de negócio preservada)
- Carnê e recibo PDF atualizados após baixa
- Auditoria de movimentações financeiras

---

## 3. Fluxo de caixa automático

Objetivo: eliminar lançamentos manuais repetitivos e manter conciliação em tempo real.

### Entradas automáticas

- Recebimento de parcelas (boleto, Pix, transferência)
- Entrada de sinal / entrada de contrato
- Estorno revertido

### Saídas automáticas

- Comissões de corretores (quando configurado)
- Tarifas bancárias
- Despesas recorrentes cadastradas

### Tarifas

- Registro automático de tarifas de boleto e Pix
- Configuração por banco e por empresa

### Transferências

- Entre contas da mesma empresa
- Histórico e rastreabilidade

### Conciliação bancária

- Importação de extrato (OFX / CSV)
- Match automático com parcelas e movimentações
- Painel de pendências e divergências

---

## 4. Importação de dados

Objetivo: facilitar migração de loteadoras que já operam em planilhas ou sistemas legados.

| Tipo | Formato | Escopo |
|------|---------|--------|
| Clientes | Excel (.xlsx) | Nome, CPF/CNPJ, contato, endereço |
| Parcelas | Excel (.xlsx) | Vínculo com contrato, vencimento, valor, status |
| Corretores | Excel (.xlsx) | Dados cadastrais e comissão |
| Contratos antigos | PDF | Armazenamento e indexação (sem OCR na fase 1) |

### Requisitos

- Template Excel padronizado para download
- Validação linha a linha com relatório de erros
- Importação em lote com preview antes de confirmar
- Log de auditoria da importação

---

## 5. Aplicativo mobile

Objetivo: estender o SV LOTES para corretores e equipe de campo.

### Plataformas

- **Android** (prioridade)
- **iOS**

### Funcionalidades (MVP)

- Login de corretor
- Consulta de lotes (disponibilidade, quadra, preço)
- Notificações push (nova venda, parcela vencida, mensagem da equipe)

### Integração

- Mesma base Supabase e regras de permissão por empresa
- Sincronização com mapa GIS (consulta somente leitura no MVP)

---

## 6. Inteligência artificial

Objetivo: automação inteligente e insights para gestores.

| Recurso | Descrição |
|---------|-----------|
| Assistente WhatsApp | Atendimento e consultas básicas via WhatsApp Business API |
| Resumo financeiro | Resumo diário/semanal automático para gestores |
| Cobrança automática | Lembretes inteligentes de parcelas vencidas e a vencer |
| Relatórios inteligentes | Análises em linguagem natural sobre vendas, inadimplência e projeções |

### Premissas

- IA como camada auxiliar — nunca substituir regras de negócio críticas
- Dados sensíveis tratados conforme LGPD
- Ações automáticas sempre auditáveis

---

## 7. Regras de publicação

### Princípios

1. **Nada de funcionalidade incompleta na `main`** — feature só entra em produção quando pronta e testada.
2. **Correções urgentes em `main`** — hotfix direto em produção quando necessário (segurança, bug crítico).
3. **Sincronizar correções da `main` para `develop`** — após hotfix, merge ou cherry-pick em `develop` para evitar divergência.
4. **`develop` só vai para `main` quando validada** — PR obrigatório com checklist completo.

### Hotfix (emergência)

```
main  →  correção  →  deploy produção
  ↓
develop  ←  merge/cherry-pick da correção
```

### Release normal

```
develop  →  testes + preview  →  PR  →  merge main  →  deploy produção
```

---

## Cronograma sugerido (referência)

| Fase | Entregas principais | Prioridade |
|------|---------------------|------------|
| Fase 0 | Estrutura `develop` / `main`, roadmap, checklist | ✅ Em andamento |
| Fase 1 | Integração bancária (Sicoob, Sicredi) + Pix + boleto | Alta |
| Fase 2 | Fluxo de caixa automático + conciliação | Alta |
| Fase 3 | Importação Excel (clientes, parcelas, corretores) | Média |
| Fase 4 | App mobile (Android MVP) | Média |
| Fase 5 | IA (WhatsApp, cobrança, relatórios) | Média |

---

*Última atualização: junho/2026 · Branch: `develop`*
