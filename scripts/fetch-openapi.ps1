# scripts/fetch-openapi.ps1
#
# Récupère le spec OpenAPI du module ContractorCompliance depuis le backend
# Tuita (api-tools-documentation) et le sauve dans openapi/.
#
# Pré-requis : backend Tuita lancé (docker-compose up), port 8060 atteignable.
#
# Usage :
#   .\scripts\fetch-openapi.ps1
#   .\scripts\fetch-openapi.ps1 -BackendUrl http://localhost:8060
#
# IMPORTANT : tant que l'export api-tools-documentation côté backend n'est pas
# validé (chemin + complétude), la source de vérité reste le YAML manuel
# `openapi/contractor-compliance.openapi.yaml` généré à partir des routes
# réelles des fichiers `module/ContractorCompliance/config/domains/*.config.php`.
# Ce script est un slot prêt pour le jour où l'export sera fiable.

param(
    [string]$BackendUrl = 'http://localhost:8060',
    [string]$OutputPath = 'openapi/contractor-compliance.fetched.json'
)

$ErrorActionPreference = 'Stop'

$specUrl = "$BackendUrl/api-tools/api/ContractorCompliance"

Write-Host "Fetching OpenAPI spec from $specUrl ..."

try {
    $resp = Invoke-WebRequest -Uri $specUrl -UseBasicParsing -TimeoutSec 30
} catch {
    Write-Error "Failed to fetch spec: $($_.Exception.Message)"
    exit 1
}

if ($resp.StatusCode -ne 200) {
    Write-Error "Backend returned HTTP $($resp.StatusCode)"
    exit 1
}

$dir = Split-Path -Parent $OutputPath
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
}

Set-Content -Path $OutputPath -Value $resp.Content -Encoding UTF8
Write-Host "Saved spec to $OutputPath ($([Math]::Round($resp.Content.Length / 1024, 1)) KB)"
Write-Host ""
Write-Host "Next step : compare with openapi/contractor-compliance.openapi.yaml."
Write-Host "When the fetched spec is validated, point ng-openapi-gen.json `input` to it."
