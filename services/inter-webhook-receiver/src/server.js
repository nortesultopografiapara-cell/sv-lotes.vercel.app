/**
 * Servidor HTTPS mTLS — valida certificado cliente do Inter (ca.crt)
 * e encaminha payload assinado HMAC ao SV LOTES.
 *
 * Env (preferir PEM em secrets; paths só para dev local):
 *  INTER_WEBHOOK_CA_PEM ou INTER_WEBHOOK_CA_PATH  — trust anchor (ca.crt)
 *  TLS_CERT_PEM / TLS_CERT_PATH                     — certificado do servidor (CA pública)
 *  TLS_KEY_PEM / TLS_KEY_PATH                       — chave do servidor
 *  SV_LOTES_INTERNAL_WEBHOOK_URL                    — https://.../api/finance/inter/webhook/internal
 *  INTER_WEBHOOK_HMAC_SECRET                        — segredo compartilhado
 *  PORT                                             — default 8443 (Fly internal_port)
 *  HOST                                             — default 0.0.0.0
 *
 * Nota health: com rejectUnauthorized=true o handshake exige client cert.
 * Fly deve usar tcp_checks (não HTTP) — ver fly.toml / README.
 */

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNonce, signInterWebhookHmac } from './hmac.js';

function readPem(envPem, envPath, label) {
  const pem = String(process.env[envPem] || '').trim();
  if (pem) return pem.replace(/\\n/g, '\n');
  const p = String(process.env[envPath] || '').trim();
  if (p) return fs.readFileSync(p, 'utf8');
  throw new Error(`Configuração ausente: ${envPem} ou ${envPath} (${label})`);
}

function minimalStructureOk(body) {
  if (Array.isArray(body)) return body.length > 0;
  if (body && typeof body === 'object') return true;
  return false;
}

function sendJson(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function forwardToSvLotes(companyId, interPayload, headers) {
  const target = String(process.env.SV_LOTES_INTERNAL_WEBHOOK_URL || '').trim();
  const secret = String(process.env.INTER_WEBHOOK_HMAC_SECRET || '').trim();
  if (!target || !secret) {
    throw new Error('SV_LOTES_INTERNAL_WEBHOOK_URL / INTER_WEBHOOK_HMAC_SECRET ausentes.');
  }

  const bodyObj = {
    companyId,
    receivedAt: new Date().toISOString(),
    receiverNonce: createNonce(),
    contaCorrente: headers['x-conta-corrente'] || null,
    payload: interPayload,
  };
  const body = JSON.stringify(bodyObj);
  const timestamp = String(Date.now());
  const nonce = createNonce();
  const signature = signInterWebhookHmac(secret, timestamp, nonce, body);

  const res = await fetch(target, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-SV-Timestamp': timestamp,
      'X-SV-Nonce': nonce,
      'X-SV-Signature': signature,
    },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, ok: res.ok };
}

export function createServer(options = {}) {
  const ca = options.ca || readPem('INTER_WEBHOOK_CA_PEM', 'INTER_WEBHOOK_CA_PATH', 'ca.crt');
  const cert = options.cert || readPem('TLS_CERT_PEM', 'TLS_CERT_PATH', 'server cert');
  const key = options.key || readPem('TLS_KEY_PEM', 'TLS_KEY_PATH', 'server key');

  const server = https.createServer(
    {
      cert,
      key,
      ca,
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
    async (req, res) => {
      try {
        if (!req.socket.authorized) {
          sendJson(res, 401, { error: 'mTLS rejeitado — certificado cliente não autorizado.' });
          return;
        }

        const url = new URL(req.url || '/', `https://${req.headers.host || 'localhost'}`);
        // /health exige mTLS (mesmo servidor). Fly usa tcp_checks — ver README.
        if (req.method === 'GET' && url.pathname === '/health') {
          sendJson(res, 200, { ok: true, service: 'inter-webhook-receiver' });
          return;
        }

        const match = url.pathname.match(/^\/webhook\/([0-9a-fA-F-]{36})$/);
        if (req.method !== 'POST' || !match) {
          sendJson(res, 404, { error: 'Not found' });
          return;
        }
        const companyId = match[1];

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(raw || 'null');
        } catch {
          sendJson(res, 400, { error: 'JSON inválido.' });
          return;
        }
        if (!minimalStructureOk(parsed)) {
          sendJson(res, 400, { error: 'Estrutura mínima do callback inválida.' });
          return;
        }

        const forward = await forwardToSvLotes(companyId, parsed, req.headers);
        // Não ecoar payload Inter / não logar body
        sendJson(res, forward.ok ? 200 : 502, {
          ok: forward.ok,
          forwarded: true,
          svStatus: forward.status,
        });
      } catch (err) {
        // Nunca logar PEM / HMAC / payload completo
        console.error('[inter-webhook-receiver]', err instanceof Error ? err.message : 'error');
        sendJson(res, 500, { error: 'Erro interno do receptor.' });
      }
    },
  );

  return server;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const port = Number(process.env.PORT || 8443);
  const host = String(process.env.HOST || '0.0.0.0').trim() || '0.0.0.0';
  const server = createServer();
  server.listen(port, host, () => {
    console.log(`[inter-webhook-receiver] listening on ${host}:${port} (mTLS, TCP passthrough ready)`);
  });
}
