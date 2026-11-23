<#
.SYNOPSIS
Zero-setup bootstrap for GENESIS-OMEGA on Windows (PowerShell 5.1 / 7+).

.DESCRIPTION
Checks Node.js >= 20, probes the local Ollama endpoint, installs dependencies,
reports toolchain readiness, runs the full verification gate and prints the
exact local-first startup command. Nothing is downloaded implicitly: model
pulling happens ONLY with -PullModels (or --pull-models). No PATH changes and
no secrets are written anywhere.
#>
[CmdletBinding()]
param(
  [switch]$PullModels
)

# Accept the POSIX-style flag too, for copy/paste parity with bootstrap.sh.
if ($args -contains '--pull-models') { $PullModels = $true }

$ErrorActionPreference = 'Stop'
$OllamaHost = $env:OLLAMA_HOST
if ([string]::IsNullOrWhiteSpace($OllamaHost)) { $OllamaHost = 'http://127.0.0.1:11434' }

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Fail([string]$Message) { Write-Host "[FAIL] $Message" -ForegroundColor Red; exit 1 }

Write-Step '1/6 Node.js runtime'
try {
  $nodeText = (& node --version 2>$null).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($nodeText)) { Fail 'Node.js is not installed or not on PATH.' }
  $major = [int](($nodeText -replace '^v', '').Split('.')[0])
  if ($major -lt 20) { Fail "Node.js >= 20 required, found $nodeText" }
  Write-Ok "Node.js $nodeText"
} catch { Fail "Could not verify Node.js: $($_.Exception.Message)" }

Write-Step "2/6 Local Ollama reachability ($OllamaHost)"
try {
  $response = Invoke-WebRequest -Uri "$OllamaHost/api/tags" -TimeoutSec 5 -UseBasicParsing
  if ($response.StatusCode -eq 200) { Write-Ok 'Ollama is reachable.' }
  else { Write-Warn "Ollama returned HTTP $($response.StatusCode)." }
} catch {
  Write-Warn "Ollama is not reachable at $OllamaHost. Start Ollama, or use the deterministic local path."
}

Write-Step '3/6 Install dependencies'
& npm install
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed.' }
Write-Ok 'Dependencies installed.'

Write-Step '4/6 Toolchain readiness (18 ecosystems)'
& npm run doctor
if ($LASTEXITCODE -ne 0) { Write-Warn 'npm run doctor reported missing host toolchains; see the table above.' }
else { Write-Ok 'All critical doctor gates passed.' }

Write-Step '5/6 Optional local starter models'
if ($PullModels) {
  foreach ($model in @('qwen2.5-coder:1.5b', 'qwen2.5-coder:3b')) {
    Write-Host "ollama pull $model"
    & ollama pull $model
    if ($LASTEXITCODE -ne 0) { Write-Warn "Could not pull $model (Ollama must be running)." }
  }
} else {
  Write-Ok 'Skipped (pass -PullModels or --pull-models to pull qwen2.5-coder:1.5b and 3b explicitly).'
}

Write-Step '6/6 Full verification gate'
& npm run check
if ($LASTEXITCODE -ne 0) { Fail 'npm run check failed; fix the reported gates before starting the studio.' }
Write-Ok 'SECRETS_OK and doctor critical gates passed.'

Write-Host "`nBOOTSTRAP_OK" -ForegroundColor Green
Write-Host 'Start the studio (local-first, no cloud key required):' -ForegroundColor White
Write-Host '  OMEGA_LOCAL_FIRST=1 npm run dev' -ForegroundColor White
Write-Host 'On Windows PowerShell, set the env var first:' -ForegroundColor White
Write-Host '  $env:OMEGA_LOCAL_FIRST = "1"; npm run dev' -ForegroundColor White
Write-Host 'Open http://127.0.0.1:3000' -ForegroundColor White
