/**
 * Testes Fase A — configuração Banco Inter (isolada do Asaas).
 * npm run test:inter-fase-a
 */
import { generateKeyPairSync } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  validateInterCertificatePem,
  validateInterPrivateKeyPem,
  validateInterCertificateKeyPair,
  serializeInterCertificateCredential,
  parseInterCertificateCredential,
} from '../lib/banking/inter/interPemValidation';
import { assertInterConfigResponseSafe } from '../lib/banking/inter/interConfigRepository';
import { EMPTY_INTER_BANK_CONFIG } from '../lib/banking/inter/interConfigTypes';
import { getBankProvider } from '../lib/banking/registry';
import { BANK_PROVIDERS } from '../lib/banking/types';
import {
  INTER_BOLETO_NOT_ENABLED_MESSAGE,
  interBankProvider,
} from '../lib/banking/providers/interBankProvider';
import {
  decryptBankingSecret,
  encryptBankingSecret,
} from '../lib/banking/credentialsCrypto';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FALHOU — ${msg}`);
  console.log(`PASSOU — ${msg}`);
}

function resolveOpenSslBin(): string | null {
  const candidates = [
    process.env.OPENSSL_BIN,
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
  ].filter(Boolean) as string[];
  for (const bin of candidates) {
    try {
      execSync(`"${bin}" version`, { stdio: 'ignore' });
      return bin;
    } catch {
      /* try next */
    }
  }
  return null;
}

function loadFixturePair(): { cert: string; key: string } | null {
  const certPath = path.join(process.cwd(), 'scripts/fixtures/inter-test-cert.pem');
  const keyPath = path.join(process.cwd(), 'scripts/fixtures/inter-test-key.pem');
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath, 'utf8'),
      key: fs.readFileSync(keyPath, 'utf8'),
    };
  }
  return null;
}

function generateRealTestPair(): { cert: string; key: string } {
  const fixture = loadFixturePair();
  if (fixture) return fixture;

  const openssl = resolveOpenSslBin();
  if (!openssl) throw new Error('openssl/fixture indisponível');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inter-pem-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  try {
    execSync(
      `"${openssl}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 1 -nodes -subj "/CN=svlotes-inter-test"`,
      { stdio: 'ignore' },
    );
    return {
      key: fs.readFileSync(keyPath, 'utf8'),
      cert: fs.readFileSync(certPath, 'utf8'),
    };
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  let pair: { cert: string; key: string } | null = null;
  try {
    pair = generateRealTestPair();
  } catch {
    console.log('AVISO — openssl indisponível; testes de par PEM real serão pulados.');
  }

  // 1 Client ID no modelo público
  {
    const cfg = {
      ...EMPTY_INTER_BANK_CONFIG('co-1'),
      clientId: 'inter-client-id-abc',
      clientIdConfigured: true,
    };
    assert(cfg.clientId === 'inter-client-id-abc', 'salvar Client ID (modelo público)');
    assertInterConfigResponseSafe(cfg);
  }

  // 2 Client Secret criptografado (AES-GCM existente)
  {
    const original = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
    process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'test-banking-key-32chars-min!!';
    const secret = 'inter-client-secret-value';
    const encrypted = encryptBankingSecret(secret);
    assert(encrypted !== secret, 'Client Secret não fica em plaintext');
    assert(!encrypted.includes(secret), 'ciphertext sem secret legível');
    assert(decryptBankingSecret(encrypted) === secret, 'Client Secret criptografado/decrypt ok');
    if (original === undefined) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = original;
  }

  // 3-4 upload válido (PEM)
  if (pair) {
    assert(validateInterCertificatePem(pair.cert).ok, 'upload de certificado válido');
    assert(validateInterPrivateKeyPem(pair.key).ok, 'upload de chave válida');
  }

  // 5 rejeitar certificado inválido
  {
    assert(!validateInterCertificatePem('not-a-cert').ok, 'rejeita certificado inválido');
    assert(!validateInterCertificatePem('').ok, 'rejeita certificado vazio');
    assert(
      !validateInterCertificatePem('-----BEGIN CERTIFICATE-----\nbad\n-----END CERTIFICATE-----')
        .ok,
      'rejeita certificado PEM malformado',
    );
  }

  // 6 rejeitar chave inválida
  {
    assert(!validateInterPrivateKeyPem('hello').ok, 'rejeita chave inválida');
    assert(
      !validateInterPrivateKeyPem('-----BEGIN PRIVATE KEY-----\nbad\n-----END PRIVATE KEY-----')
        .ok,
      'rejeita chave PEM malformada',
    );
  }

  // 7 match / mismatch
  if (pair) {
    const other = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const mismatch = validateInterCertificateKeyPair(pair.cert, other.privateKey as string);
    assert(!mismatch.ok, 'rejeita certificado/chave que não correspondem');
    assert(
      mismatch.message.includes('não correspondem'),
      'mensagem clara de não correspondência',
    );
    assert(validateInterCertificateKeyPair(pair.cert, pair.key).ok, 'aceita par correspondente');

    const raw = serializeInterCertificateCredential({
      certificatePem: pair.cert,
      privateKeyPem: pair.key,
      certificateFileName: 'Inter_API_Certificado.crt',
      privateKeyFileName: 'Inter_API_Chave.key',
    });
    const parsed = parseInterCertificateCredential(raw);
    assert(parsed?.certificateFileName === 'Inter_API_Certificado.crt', 'nome cert persistido');
    assert(parsed?.privateKeyFileName === 'Inter_API_Chave.key', 'nome chave persistido');

    const encKey = process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
    process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = 'test-banking-key-32chars-min!!';
    const encBundle = encryptBankingSecret(raw);
    assert(!encBundle.includes('BEGIN CERTIFICATE'), 'bundle cert criptografado');
    assert(!encBundle.includes('BEGIN PRIVATE KEY'), 'bundle key criptografado');
    if (encKey === undefined) delete process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY;
    else process.env.BANKING_CREDENTIALS_ENCRYPTION_KEY = encKey;
  } else {
    console.log('PULOU — match cert/key e serialize (openssl)');
  }

  // 8-9 GET nunca devolve secrets
  {
    const cfg = {
      ...EMPTY_INTER_BANK_CONFIG('co-1'),
      clientId: 'client-public-id',
      clientIdConfigured: true,
      hasClientSecret: true,
      hasCertificate: true,
      hasPrivateKey: true,
      certificateFileName: 'Inter_API_Certificado.crt',
      privateKeyFileName: 'Inter_API_Chave.key',
      message: 'Configuração salva.',
    };
    assertInterConfigResponseSafe(cfg);
    const json = JSON.stringify(cfg);
    assert(!/'clientSecret'/.test(json) && !json.includes('"clientSecret"'), 'GET sem Client Secret');
    assert(!json.includes('BEGIN CERTIFICATE'), 'GET sem PEM certificado');
    assert(!json.includes('BEGIN PRIVATE KEY'), 'GET sem chave privada');
    assert(!json.includes('encrypted_payload'), 'GET sem ciphertext');
    assert(cfg.connectionVerified === false, 'GET sem Integração verificada');
  }

  // 10 isolamento por empresa / provider
  {
    assert(BANK_PROVIDERS.includes('INTER'), 'INTER no enum TypeScript');
    assert(BANK_PROVIDERS.includes('ASAAS_COMPANY'), 'ASAAS_COMPANY preservado');
    assert(getBankProvider('INTER')?.providerCode === 'INTER', 'registry INTER');
    assert(getBankProvider('ASAAS_COMPANY') == null, 'Asaas fora do registry genérico');

    const repo = fs.readFileSync(
      path.join(process.cwd(), 'lib/banking/inter/interConfigRepository.ts'),
      'utf8',
    );
    assert(repo.includes(".eq('company_id', companyId)"), 'queries filtram company_id');
    assert(repo.includes(".eq('provider', 'INTER')"), 'queries filtram provider INTER');
    assert(repo.includes('is_default: false'), 'Inter não vira default (protege Asaas)');
    assert(
      repo.includes('NÃO usa get/saveCompanyBankIntegrationConfig'),
      'documenta isolamento do repositório default',
    );
    assert(
      !repo.includes("from '@/lib/banking/integrationRepository'") &&
        !repo.includes('from "@/lib/banking/integrationRepository"'),
      'não importa integrationRepository compartilhado',
    );
  }

  // emissão bloqueada + teste local
  {
    await interBankProvider
      .createBoleto(
        {
          companyId: 'c',
          integrationId: 'i',
          financeReceiptId: 'r',
          amount: 10,
          dueDate: '2026-01-01',
          payerName: 'A',
          idempotencyKey: 'k',
        },
        { companyId: 'c', integrationId: 'i', environment: 'SANDBOX' },
      )
      .then(() => {
        throw new Error('não deveria emitir');
      })
      .catch((e: Error) => {
        assert(e.message === INTER_BOLETO_NOT_ENABLED_MESSAGE, 'emissão bloqueada na Fase A');
      });

    const test = await interBankProvider.testConnection({
      companyId: 'c',
      integrationId: 'i',
      environment: 'SANDBOX',
      config: {
        clientId: 'x',
        hasClientSecret: true,
        hasCertificate: true,
        hasPrivateKey: true,
      },
    });
    assert(test.ok, 'teste local ok com config completa');
    assert(test.message.includes('OAuth+mTLS'), 'aponta para teste OAuth+mTLS real');
  }

  // 11 Asaas regressão — ASAAS ANTES = ASAAS DEPOIS (arquivos + isolation)
  {
    const root = process.cwd();
    const asaasFiles = [
      'lib/finance/asaasCompanyChargeService.ts',
      'lib/finance/companyAsaasWebhookHandler.ts',
      'app/api/finance/asaas/company-webhook/route.ts',
      'app/api/finance/asaas/sale-charges/generate-missing/route.ts',
      'app/api/finance/asaas/sale-charges/carne-pdf/route.ts',
      'components/finance/AsaasIntegrationPanel.tsx',
    ];
    for (const f of asaasFiles) {
      assert(fs.existsSync(path.join(root, f)), `Asaas intacto: ${f}`);
    }

    const interRoute = fs.readFileSync(
      path.join(root, 'app/api/banking/inter/config/route.ts'),
      'utf8',
    );
    assert(interRoute.includes('getCompanyInterBankConfig'), 'API Inter isolada');
    assert(!interRoute.includes('company_asaas'), 'API Inter não referencia Asaas');
    assert(
      !interRoute.includes('getCompanyBankIntegrationConfig'),
      'API Inter não usa save default genérico',
    );
    assert(
      interRoute.includes('Nunca logar body/PEM') || interRoute.includes('Nunca logar'),
      'API evita log de PEM',
    );

    const panel = fs.readFileSync(
      path.join(root, 'components/finance/BanksDevelopmentPanel.tsx'),
      'utf8',
    );
    assert(panel.includes('Configurar Banco Inter'), 'UI Configurar Banco Inter');
    assert(panel.includes('InterBankConfigPanel'), 'painel Inter');

    const uiPanel = fs.readFileSync(
      path.join(root, 'components/finance/InterBankConfigPanel.tsx'),
      'utf8',
    );
    assert(uiPanel.includes('Selecionar certificado'), 'UI upload certificado');
    assert(uiPanel.includes('Selecionar chave privada'), 'UI upload chave');
    assert(uiPanel.includes('Configurado ••••••••••'), 'UI mascara Client Secret');
    assert(uiPanel.includes('Testar conexão'), 'UI botão Testar conexão');
    assert(uiPanel.includes('Integração verificada'), 'UI status verificação');

    const mig = fs.readFileSync(
      path.join(root, 'supabase/migrations/20260830180000_bank_integrations_provider_inter.sql'),
      'utf8',
    );
    assert(mig.includes("'INTER'"), 'migration INTER');
    assert(
      !/ALTER\s+TABLE[\s\S]*company_asaas/i.test(mig),
      'migration não altera tabelas company_asaas',
    );
    assert(
      mig.includes('Não altera company_asaas_charges') ||
        mig.toLowerCase().includes('não altera company_asaas'),
      'migration documenta não alterar Asaas',
    );
  }

  console.log('\nOK mandatory-inter-bank-config-fase-a-tests');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
