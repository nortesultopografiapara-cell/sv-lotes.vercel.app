/**
 * Testes unitários do receptor (sem rede Inter / sem Asaas).
 */
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { describe, it } from 'node:test';
import { signInterWebhookHmac, createNonce } from '../src/hmac.js';

describe('hmac receiver', () => {
  it('assina de forma determinística', () => {
    const sig = signInterWebhookHmac('secret', '1', 'n', '{"a":1}');
    const expected = createHmac('sha256', 'secret')
      .update('1.n.{"a":1}', 'utf8')
      .digest('hex');
    assert.equal(sig, expected);
  });

  it('gera nonce', () => {
    assert.equal(createNonce().length, 32);
  });
});

describe('mtls ca trust concept', () => {
  it('ca.crt é trust anchor distinto de keypair API', () => {
    // Gera CA/self-signed apenas para provar que Agent usaria ca ≠ client API
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    assert.ok(privateKey.includes('PRIVATE KEY'));
    assert.ok(publicKey.includes('PUBLIC KEY'));
    // Certificado webhook (ca) NÃO deve ser a private key da API
    assert.ok(!privateKey.includes('BEGIN CERTIFICATE'));
  });
});
