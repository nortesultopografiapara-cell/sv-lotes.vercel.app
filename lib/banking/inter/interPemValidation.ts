/**
 * Validação local de certificado/chave PEM do Banco Inter (Fase A).
 * Sem chamadas de rede. Nunca logar conteúdo PEM.
 */

import { createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto';

export const INTER_PEM_MAX_BYTES = 64 * 1024;

export type InterPemValidationResult = {
  ok: boolean;
  message: string;
};

function normalizePem(raw: string): string {
  return String(raw || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function looksLikePemCertificate(raw: string): boolean {
  const pem = normalizePem(raw);
  return (
    /-----BEGIN CERTIFICATE-----/.test(pem) &&
    /-----END CERTIFICATE-----/.test(pem)
  );
}

export function looksLikePemPrivateKey(raw: string): boolean {
  const pem = normalizePem(raw);
  return (
    (/-----BEGIN PRIVATE KEY-----/.test(pem) && /-----END PRIVATE KEY-----/.test(pem)) ||
    (/-----BEGIN RSA PRIVATE KEY-----/.test(pem) && /-----END RSA PRIVATE KEY-----/.test(pem)) ||
    (/-----BEGIN EC PRIVATE KEY-----/.test(pem) && /-----END EC PRIVATE KEY-----/.test(pem))
  );
}

export function validateInterCertificatePem(raw: string): InterPemValidationResult {
  const pem = normalizePem(raw);
  if (!pem) return { ok: false, message: 'Certificado vazio.' };
  if (Buffer.byteLength(pem, 'utf8') > INTER_PEM_MAX_BYTES) {
    return { ok: false, message: 'Certificado excede o tamanho máximo permitido.' };
  }
  if (!looksLikePemCertificate(pem)) {
    return {
      ok: false,
      message: 'Certificado inválido. Esperado PEM com BEGIN CERTIFICATE.',
    };
  }
  try {
    // eslint-disable-next-line no-new
    new X509Certificate(pem);
    return { ok: true, message: 'Certificado PEM válido.' };
  } catch {
    return { ok: false, message: 'Certificado PEM não pôde ser interpretado.' };
  }
}

export function validateInterPrivateKeyPem(raw: string): InterPemValidationResult {
  const pem = normalizePem(raw);
  if (!pem) return { ok: false, message: 'Chave privada vazia.' };
  if (Buffer.byteLength(pem, 'utf8') > INTER_PEM_MAX_BYTES) {
    return { ok: false, message: 'Chave privada excede o tamanho máximo permitido.' };
  }
  if (!looksLikePemPrivateKey(pem)) {
    return {
      ok: false,
      message:
        'Chave privada inválida. Esperado PEM (PRIVATE KEY / RSA PRIVATE KEY / EC PRIVATE KEY).',
    };
  }
  try {
    createPrivateKey(pem);
    return { ok: true, message: 'Chave privada PEM válida.' };
  } catch {
    return { ok: false, message: 'Chave privada PEM não pôde ser interpretada.' };
  }
}

/**
 * Verifica se certificado e chave privada formam um par correspondente.
 */
export function validateInterCertificateKeyPair(
  certificatePem: string,
  privateKeyPem: string,
): InterPemValidationResult {
  const certCheck = validateInterCertificatePem(certificatePem);
  if (!certCheck.ok) return certCheck;
  const keyCheck = validateInterPrivateKeyPem(privateKeyPem);
  if (!keyCheck.ok) return keyCheck;

  try {
    const cert = new X509Certificate(normalizePem(certificatePem));
    const privateKey = createPrivateKey(normalizePem(privateKeyPem));
    // Node 20+: cert.publicKey já é KeyObject público — não passar por createPublicKey().
    const fromCert = cert.publicKey.export({ type: 'spki', format: 'der' });
    const fromKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
    if (!Buffer.from(fromCert).equals(Buffer.from(fromKey))) {
      return {
        ok: false,
        message: 'O certificado e a chave privada não correspondem.',
      };
    }
    return { ok: true, message: 'Certificado e chave privada correspondem.' };
  } catch {
    return {
      ok: false,
      message: 'Não foi possível validar o par certificado/chave privada.',
    };
  }
}

export type InterCertificateCredentialPayload = {
  certificatePem: string;
  privateKeyPem: string;
  certificateFileName: string;
  privateKeyFileName: string;
};

export function serializeInterCertificateCredential(
  payload: InterCertificateCredentialPayload,
): string {
  return JSON.stringify({
    certificatePem: normalizePem(payload.certificatePem),
    privateKeyPem: normalizePem(payload.privateKeyPem),
    certificateFileName: String(payload.certificateFileName || '').trim().slice(0, 180),
    privateKeyFileName: String(payload.privateKeyFileName || '').trim().slice(0, 180),
  });
}

export function parseInterCertificateCredential(
  raw: string,
): InterCertificateCredentialPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<InterCertificateCredentialPayload>;
    if (!parsed?.certificatePem || !parsed?.privateKeyPem) return null;
    return {
      certificatePem: normalizePem(String(parsed.certificatePem)),
      privateKeyPem: normalizePem(String(parsed.privateKeyPem)),
      certificateFileName: String(parsed.certificateFileName || '').trim(),
      privateKeyFileName: String(parsed.privateKeyFileName || '').trim(),
    };
  } catch {
    return null;
  }
}
