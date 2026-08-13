# Deploy controlado do receptor mTLS Inter no Fly.io
# NÃO grava segredos no Git.
#
# Pré-requisitos:
#   1) flyctl autenticado — em terminal interativo: fly auth login
#      OU: $env:FLY_API_TOKEN = "<token>"
#   2) PEMs locais:
#      $env:INTER_CA_FILE = path do ca.crt (Certificado Webhook Inter)
#      $env:TLS_CERT_FILE = path do fullchain.pem (DNS-01)
#      $env:TLS_KEY_FILE  = path do privkey.pem
#      $env:INTER_WEBHOOK_HMAC_SECRET = mesmo do Vercel Preview
#
# Uso:
#   cd services\inter-webhook-receiver
#   .\scripts\fly-deploy-receiver.ps1

$ErrorActionPreference = "Stop"
$App = "sv-lotes-inter-webhook"
$Region = "gru"
$PreviewInternal =
  "https://sv-lotes-vercel-czimtdkpt.vercel.app/api/finance/inter/webhook/internal"

$ReceiverDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ReceiverDir

function Require-File([string]$path, [string]$label) {
  if (-not $path -or -not (Test-Path -LiteralPath $path)) {
    throw "Arquivo obrigatório ausente ($label): $path"
  }
  return (Get-Content -Raw -LiteralPath $path)
}

$fly = Join-Path $env:USERPROFILE ".fly\bin\flyctl.exe"
if (-not (Test-Path $fly)) { $fly = "flyctl" }

Write-Host "==> Auth check"
& $fly auth whoami
if ($LASTEXITCODE -ne 0) { throw "Faça fly auth login ou defina FLY_API_TOKEN" }

Write-Host "==> Ensure app $App"
& $fly apps create $App --org personal 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "(app pode já existir — ok)"
}

Write-Host "==> Allocate dedicated IPv4"
& $fly ips allocate-v4 -a $App
& $fly ips list -a $App

$caFile = $env:INTER_CA_FILE
$certFile = $env:TLS_CERT_FILE
$keyFile = $env:TLS_KEY_FILE
$hmac = $env:INTER_WEBHOOK_HMAC_SECRET
if (-not $hmac) { throw "Defina INTER_WEBHOOK_HMAC_SECRET (igual ao Vercel Preview)" }

Write-Host "==> Secrets"
$ca = Require-File $caFile "ca.crt Inter → INTER_WEBHOOK_CA_PEM"
$cert = Require-File $certFile "fullchain.pem → TLS_CERT_PEM"
$key = Require-File $keyFile "privkey.pem → TLS_KEY_PEM"

& $fly secrets set `
  "INTER_WEBHOOK_CA_PEM=$ca" `
  "TLS_CERT_PEM=$cert" `
  "TLS_KEY_PEM=$key" `
  "SV_LOTES_INTERNAL_WEBHOOK_URL=$PreviewInternal" `
  "INTER_WEBHOOK_HMAC_SECRET=$hmac" `
  -a $App

Write-Host "==> Deploy (TCP passthrough 443→8443, sem TLS handler Fly)"
& $fly deploy -a $App --remote-only
if ($LASTEXITCODE -ne 0) { throw "fly deploy falhou" }

& $fly status -a $App
& $fly ips list -a $App

Write-Host @"

Validar SEM client cert (deve falhar no handshake):
  curl.exe -vk https://inter-webhook.svlotes.com.br/health

DNS A: inter-webhook.svlotes.com.br -> IPv4 dedicado listado acima
NÃO cadastrar webhook no Inter ainda.
"@
