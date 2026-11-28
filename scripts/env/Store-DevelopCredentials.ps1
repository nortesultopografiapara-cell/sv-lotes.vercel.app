# Armazena, uma vez, as três variáveis do Supabase Develop no Gerenciador de Credenciais do Windows.
# Não imprime os valores. Recusa Production e o projeto aposentado.
# Uso, na raiz do repositório: .\scripts\env\Store-DevelopCredentials.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root
. (Join-Path $PSScriptRoot 'SvLotesCredential.ps1')

function Read-LocalSecret([string]$label) {
  $secure = Read-Host -AsSecureString -Prompt $label
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Output 'Informe as credenciais do Supabase Develop no prompt local. Elas não aparecem na tela.'
$url = Read-LocalSecret 'NEXT_PUBLIC_SUPABASE_URL'
$anon = Read-LocalSecret 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
$service = Read-LocalSecret 'SUPABASE_SERVICE_ROLE_KEY'

$saved = @{
  url = $env:NEXT_PUBLIC_SUPABASE_URL
  anon = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY
  service = $env:SUPABASE_SERVICE_ROLE_KEY
  private = $env:SUPABASE_URL
  vercel = $env:VERCEL_ENV
  node = $env:NODE_ENV
}
$accepted = $false
try {
  $env:NEXT_PUBLIC_SUPABASE_URL = $url
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $anon
  $env:SUPABASE_SERVICE_ROLE_KEY = $service
  Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
  $env:VERCEL_ENV = 'development'
  $env:NODE_ENV = 'development'
  & node .\node_modules\tsx\dist\cli.mjs .\scripts\env\validate-supabase-project.ts
  if ($LASTEXITCODE -ne 0) { throw 'A validação recusou estas credenciais. Nada foi armazenado.' }
  $accepted = $true
} finally {
  foreach ($name in @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL','VERCEL_ENV','NODE_ENV')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  if ($null -ne $saved.url) { $env:NEXT_PUBLIC_SUPABASE_URL = $saved.url }
  if ($null -ne $saved.anon) { $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $saved.anon }
  if ($null -ne $saved.service) { $env:SUPABASE_SERVICE_ROLE_KEY = $saved.service }
  if ($null -ne $saved.private) { $env:SUPABASE_URL = $saved.private }
  if ($null -ne $saved.vercel) { $env:VERCEL_ENV = $saved.vercel }
  if ($null -ne $saved.node) { $env:NODE_ENV = $saved.node }
}

if (-not $accepted) { exit 1 }

[SvLotesCredential]::WriteSecret('SVLOTES/Develop/NEXT_PUBLIC_SUPABASE_URL', $url)
[SvLotesCredential]::WriteSecret('SVLOTES/Develop/NEXT_PUBLIC_SUPABASE_ANON_KEY', $anon)
[SvLotesCredential]::WriteSecret('SVLOTES/Develop/SUPABASE_SERVICE_ROLE_KEY', $service)
$url = $null
$anon = $null
$service = $null
Write-Output 'Credenciais do Develop armazenadas neste Windows, sem roaming. Nenhum valor foi impresso.'
