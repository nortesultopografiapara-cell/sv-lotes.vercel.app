# Prepara o .env.local de uma worktree com o Supabase Develop guardado no Windows.
# Não imprime valores. Não sobrescreve credencial local já preenchida sem -AllowOverwrite.
# Uso: .\scripts\env\Initialize-SvLotesWorktree.ps1 -Worktree "D:\caminho\da\worktree"

[CmdletBinding()]
param(
  [string]$Worktree = (Get-Location).Path,
  [switch]$AllowOverwrite
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'SvLotesCredential.ps1')

function Read-Stored([string]$name) {
  $value = [SvLotesCredential]::ReadSecret("SVLOTES/Develop/$name")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Credencial ausente no Windows: $name. Rode Store-DevelopCredentials.ps1."
  }
  if ($value -match 'SENSITIVE|REDACTED') {
    throw "Credencial $name contém marcador inválido. Nada foi escrito."
  }
  return $value
}

$root = (Resolve-Path $Worktree).Path
$validatorRoot = $root
$tsx = Join-Path $validatorRoot 'node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path -LiteralPath $tsx)) {
  $validatorRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
  $tsx = Join-Path $validatorRoot 'node_modules\tsx\dist\cli.mjs'
}
if (-not (Test-Path -LiteralPath $tsx)) {
  throw 'tsx não encontrado. Rode npm install na worktree antes de preparar o .env.local.'
}
$envFile = Join-Path $root '.env.local'
$url = Read-Stored 'NEXT_PUBLIC_SUPABASE_URL'
$anon = Read-Stored 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
$service = Read-Stored 'SUPABASE_SERVICE_ROLE_KEY'

$saved = @{
  url = $env:NEXT_PUBLIC_SUPABASE_URL
  anon = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY
  service = $env:SUPABASE_SERVICE_ROLE_KEY
  private = $env:SUPABASE_URL
  vercel = $env:VERCEL_ENV
  node = $env:NODE_ENV
}
try {
  Set-Location $validatorRoot
  $env:NEXT_PUBLIC_SUPABASE_URL = $url
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $anon
  $env:SUPABASE_SERVICE_ROLE_KEY = $service
  Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
  $env:VERCEL_ENV = 'development'
  $env:NODE_ENV = 'development'
  & node .\node_modules\tsx\dist\cli.mjs .\scripts\env\validate-supabase-project.ts
  if ($LASTEXITCODE -ne 0) { throw 'Validação recusou as credenciais armazenadas. .env.local não foi alterado.' }
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

$managed = @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY')
$lines = @()
if (Test-Path -LiteralPath $envFile) { $lines = @(Get-Content -LiteralPath $envFile) }
$occupied = @()
foreach ($line in $lines) {
  if ($line -match '^\s*([A-Z0-9_]+)=(.*)$') {
    $key = $Matches[1]
    $current = $Matches[2].Trim().Trim('"').Trim("'")
    if ($managed -contains $key -and $current -and $current -notmatch 'SENSITIVE|REDACTED') {
      $occupied += $key
    }
  }
}
if ($occupied.Count -gt 0 -and -not $AllowOverwrite) {
  Write-Output ("Já existe configuração local para: " + ($occupied -join ', ') + '. Rode de novo com -AllowOverwrite para substituir. Nenhum valor foi impresso.')
  exit 2
}

$kept = New-Object System.Collections.Generic.List[string]
foreach ($line in $lines) {
  if ($line -match '^\s*([A-Z0-9_]+)=') {
    if ($managed -contains $Matches[1]) { continue }
  }
  $kept.Add($line)
}
$kept.Add("NEXT_PUBLIC_SUPABASE_URL=$url")
$kept.Add("NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon")
$kept.Add("SUPABASE_SERVICE_ROLE_KEY=$service")
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($envFile, $kept.ToArray(), $utf8)
icacls $envFile /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
$url = $null
$anon = $null
$service = $null
Write-Output "Worktree preparada com o Supabase Develop. Arquivo local restrito ao usuário atual."
