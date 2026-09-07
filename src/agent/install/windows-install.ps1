# MikroMagic Connector — Windows installer
# ------------------------------------------------------------------
# Usage (elevated PowerShell):
#   .\windows-install.ps1 -PairingCode ABCD-EFGH-JKLM
#   irm https://mikromagic.app/api/public/connector/install/windows | iex   (then run Install-MikroMagicConnector)
#
# Installs a background Windows service-style Scheduled Task that runs the
# connector agent as SYSTEM at boot, restarts it automatically (which is also
# how secure self-updates take effect) and stores credentials in ProgramData.

[CmdletBinding()]
param(
  [string]$PairingCode = $env:MIKROMAGIC_PAIRING_CODE,
  [string]$BaseUrl = "https://mikromagic.app",
  [string]$NodeVersion = "20.18.1"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Assert-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run this installer from an elevated (Administrator) PowerShell window."
  }
}

Assert-Admin

if (-not $PairingCode) {
  $PairingCode = Read-Host "Enter the pairing code from MikroMagic -> Connectors"
}
$PairingCode = $PairingCode.Trim().ToUpper()
$BaseUrl = $BaseUrl.TrimEnd('/')

$InstallDir = Join-Path $env:ProgramData "MikroMagicConnector"
$RuntimeDir = Join-Path $InstallDir "runtime"
$AgentPath = Join-Path $InstallDir "connector-agent.mjs"
$SetupPath = Join-Path $InstallDir "connector-setup.mjs"
$TaskName = "MikroMagicConnector"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# Published SHA-256 checksums for the pinned Node.js release.
$NodeSha = @{ "x64" = "56e5aacdeee7168871721b75819ccacf2367de8761b78eaceacdecd41e04ca03";
              "x86" = "08987ceb478044b652ad57e15b96597e1eaf7f06502336b5a02c545f9e403ed6" }

# Ed25519 public key that matches the server-side update signing key.
$UpdatePublicKeyB64 = "MCowBQYDK2VwAyEACqzWWPJXbYAuE2WfbOb8USjBKEdYZ4W8ROiXB0yb3wE="

function Test-NodeVersion([string]$exe) {
  if (-not $exe) { return $false }
  if (-not (Test-Path $exe) -and -not (Get-Command $exe -ErrorAction SilentlyContinue)) { return $false }
  try { $v = (& $exe -v 2>$null).Trim().TrimStart('v') } catch { return $false }
  if (-not $v) { return $false }
  try { return ([version]$v -ge [version]$NodeVersion) } catch { return $false }
}

# --- 1. Node.js runtime (private copy, no system change) ---------------------
$NodeExe = $null
$SystemNode = (Get-Command node -ErrorAction SilentlyContinue)?.Source
$PrivateNode = Join-Path $RuntimeDir "node.exe"
if (Test-NodeVersion $SystemNode) { $NodeExe = $SystemNode }
elseif (Test-NodeVersion $PrivateNode) { $NodeExe = $PrivateNode }

if (-not $NodeExe) {
  Write-Host "Downloading the Node.js $NodeVersion runtime..."
  $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
  $zip = Join-Path $env:TEMP "node-v$NodeVersion-win-$arch.zip"
  Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-$arch.zip" -OutFile $zip
  $actual = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $NodeSha[$arch]) {
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    throw "Node.js download failed checksum verification. Aborting."
  }
  $extract = Join-Path $env:TEMP "mm-node"
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $extract -Force
  if (Test-Path $RuntimeDir) { Remove-Item $RuntimeDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  Copy-Item (Join-Path $extract "node-v$NodeVersion-win-$arch\*") $RuntimeDir -Recurse -Force
  $NodeExe = Join-Path $RuntimeDir "node.exe"
  Remove-Item $zip, $extract -Recurse -Force -ErrorAction SilentlyContinue
}

# --- 2. Agent + configuration ------------------------------------------------
Write-Host "Downloading the connector agent..."
Invoke-WebRequest -Uri "$BaseUrl/api/public/connector/download" -OutFile $AgentPath

Write-Host "Downloading the local router setup tool..."
Invoke-WebRequest -Uri "$BaseUrl/api/public/connector/setup-tool" -OutFile $SetupPath

Write-Host "Verifying the signed release manifest..."
$ManifestPath = Join-Path $InstallDir "version.json"
Invoke-WebRequest -Uri "$BaseUrl/api/public/connector/version" -OutFile $ManifestPath

$VerifyJs = Join-Path $env:TEMP "mm-verify.mjs"
@'
import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

const [, , manifestPath, baseUrl, agentPath, setupPath, publicKeyB64] = process.argv;
const body = JSON.parse(readFileSync(manifestPath, "utf8"));
const { manifest, signature } = body ?? {};
if (!manifest || !signature) {
  console.error("release manifest is missing or unsigned");
  process.exit(1);
}
const key = createPublicKey({
  key: Buffer.from(publicKeyB64, "base64"),
  format: "der",
  type: "spki",
});
if (!cryptoVerify(null, Buffer.from(JSON.stringify(manifest)), key, Buffer.from(signature, "base64"))) {
  console.error("release manifest signature is invalid");
  process.exit(1);
}
const base = baseUrl.replace(/\/+$/, "");
if (
  manifest.url !== `${base}/api/public/connector/download` ||
  manifest.setupUrl !== `${base}/api/public/connector/setup-tool`
) {
  console.error("release manifest points at an unexpected origin");
  process.exit(1);
}
const sha = (p) => createHash("sha256").update(readFileSync(p, "utf8"), "utf8").digest("hex");
if (sha(agentPath) !== manifest.sha256) {
  console.error("connector agent failed checksum verification");
  process.exit(1);
}
if (sha(setupPath) !== manifest.setupSha256) {
  console.error("setup tool failed checksum verification");
  process.exit(1);
}
console.log(`verified connector release ${manifest.version}`);
'@ | Set-Content -Path $VerifyJs -Encoding UTF8

& $NodeExe $VerifyJs $ManifestPath $BaseUrl $AgentPath $SetupPath $UpdatePublicKeyB64
$verifyExit = $LASTEXITCODE
Remove-Item $VerifyJs -Force -ErrorAction SilentlyContinue
if ($verifyExit -ne 0) {
  Remove-Item $AgentPath, $SetupPath, $ManifestPath -Force -ErrorAction SilentlyContinue
  throw "Aborting install: downloaded files could not be verified."
}

@{ baseUrl = $BaseUrl; pairingCode = $PairingCode } | ConvertTo-Json |
  Set-Content -Path (Join-Path $InstallDir "config.json") -Encoding UTF8

# Restrict the credential store to SYSTEM + Administrators.
icacls $InstallDir /inheritance:r /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" | Out-Null

# --- 3. Supervisor wrapper (restarts after crash or self-update) -------------
$runCmd = Join-Path $InstallDir "run.cmd"
@"
@echo off
:loop
"$NodeExe" "$AgentPath"
timeout /t 5 /nobreak > nul
goto loop
"@ | Set-Content -Path $runCmd -Encoding ASCII

# --- 4. Scheduled task (runs at boot as SYSTEM) ------------------------------
schtasks /Query /TN $TaskName > $null 2>&1
if ($LASTEXITCODE -eq 0) { schtasks /Delete /TN $TaskName /F | Out-Null }
schtasks /Create /TN $TaskName /TR "`"$runCmd`"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F | Out-Null
schtasks /Run /TN $TaskName | Out-Null

Write-Host ""
Write-Host "MikroMagic Connector installed." -ForegroundColor Green
Write-Host "  Location : $InstallDir"
Write-Host "  Service  : Scheduled Task '$TaskName' (starts at boot, auto-restarts)"
Write-Host "  Updates  : signed automatic updates, checked every 6 hours"
Write-Host "It should show as Online in MikroMagic -> Connectors within a minute."
Write-Host ""
Write-Host "To set up a router, connect this PC to one of the RB4011 LAN ports"
Write-Host "(ether2 ... ether10) and then run in an elevated PowerShell window:"
Write-Host "  & `"$NodeExe`" `"$SetupPath`""
Write-Host "Router credentials are typed into that tool locally and never leave this PC."
