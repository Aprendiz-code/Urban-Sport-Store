[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$Project,

  [ValidateSet('development', 'preview', 'production')]
  [string]$Target = 'preview',

  [switch]$ConfirmProduction
)

$ErrorActionPreference = 'Stop'

if ($Target -eq 'production') {
  if (-not $ConfirmProduction) {
    throw 'Production requires the -ConfirmProduction switch and an interactive confirmation.'
  }

  $confirmation = Read-Host 'Type PRODUCTION to continue'
  if ($confirmation -cne 'PRODUCTION') {
    throw 'Production confirmation did not match.'
  }
}

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  throw 'Vercel CLI is not installed or unavailable on PATH.'
}

$environmentNames = @(
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
)

foreach ($name in $environmentNames) {
  $value = [Environment]::GetEnvironmentVariable($name, 'Process')
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Required environment variable '$name' is not set in this process."
  }

  $arguments = @('env', 'add', $name, $Target, '--project', $Project, '--value', $value, '--yes')
  if ($name -eq 'SUPABASE_SERVICE_ROLE_KEY') {
    $arguments += '--sensitive'
  }

  $null = & vercel @arguments *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Vercel CLI failed while adding '$name'; CLI output was suppressed."
  }

  Write-Host "Added '$name' to '$Target'."
  Remove-Variable value -ErrorAction SilentlyContinue
}