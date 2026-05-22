# ============================================================================
# seed-real-backend.ps1 — prépare la base pour les tests Cypress real-backend.
# ----------------------------------------------------------------------------
# POURQUOI ce script vit dans le repo frontend :
#   Les tests Cypress real-backend ont besoin d'un jeu de données contractor
#   cohérent dans le backend Tuita (yplatformdb). Ce script orchestre, depuis
#   Windows, le seed côté backend SANS modifier le repo backend.
#
# CE QU'IL FAIT, dans l'ordre :
#   1. Vérifie que le conteneur backend est up (c_platform_webserver).
#   2. Purge les cc_users résiduels portant les téléphones FACTICES du test
#      (06 00 00 00 99 / 06 09 09 09 09) — sinon le seed casse sur une
#      contrainte UNIQUE (le seed n'est idempotent que par UUID, pas par phone,
#      et les runs E2E laissent des lignes avec ces téléphones).
#   3. Charge les 2 seeds idempotents du module ContractorCompliance :
#        - seed-contractors-from-smith.sql  (backfill ~479 contractors)
#        - seed-test-missions-invoices.sh   (factures/missions + PDF physiques)
#
# GARDE-FOU SMS/mail : les comptes de test utilisent UNIQUEMENT des téléphones
# factices. Le seed contient de vrais numéros de contractors — on n'y touche
# jamais via les helpers Cypress.
#
# USAGE :  npm run cypress:seed   (ou directement : pwsh scripts/seed-real-backend.ps1)
# ============================================================================
$ErrorActionPreference = 'Stop'

# Racine du repo backend (frère du repo frontend sur le disque).
$repoRoot     = Split-Path -Parent $PSScriptRoot
$backendRoot  = Join-Path (Split-Path -Parent $repoRoot) 'platform-backend'
$migrations   = Join-Path $backendRoot 'module/ContractorCompliance/migrations'
$webContainer = 'c_platform_webserver'

Write-Host '[seed] 1/3 — vérification du conteneur backend...' -ForegroundColor Cyan
$up = wsl -- docker ps --filter "name=$webContainer" --format '{{.Names}}'
if ($up -notmatch $webContainer) {
    Write-Error "[seed] Conteneur $webContainer introuvable. Lancer 'docker-compose up -d' dans platform-backend."
}
Write-Host "[seed]       $webContainer up." -ForegroundColor Green

# ── 2. Purge des cc_users résiduels (téléphones factices) ───────────────────
# PHP jetable passé par stdin pour éviter l'enfer de quoting docker exec.
Write-Host '[seed] 2/3 — purge des cc_users résiduels (téléphones factices)...' -ForegroundColor Cyan
$cleanup = @'
<?php
chdir('/var/www');
require '/var/www/vendor/autoload.php';
$appConfig = require '/var/www/config/application.config.php';
$app = \Laminas\Mvc\Application::init($appConfig);
$conn = $app->getServiceManager()->get('doctrine.entitymanager.orm_default')->getConnection();
$ids = $conn->fetchFirstColumn(
    'SELECT id FROM cc_users WHERE phone IN (?, ?)',
    ['P33600000099', 'P33609090909']
);
foreach ($ids as $id) {
    foreach (['cc_kyc_sessions' => 'user_id', 'cc_qcm_attempts' => 'user_id', 'cc_documents' => 'owner_id'] as $t => $col) {
        $conn->executeStatement("DELETE FROM {$t} WHERE {$col} = ?", [$id]);
    }
    $conn->executeStatement('DELETE FROM cc_prestataires WHERE user_id = ?', [$id]);
    $conn->executeStatement('DELETE FROM cc_users WHERE id = ?', [$id]);
}
echo 'purge: ' . count($ids) . " cc_users supprimes\n";
'@
$cleanup | wsl -- docker exec -i $webContainer php
Write-Host '[seed]       purge OK.' -ForegroundColor Green

# ── 3. Chargement des 2 seeds ───────────────────────────────────────────────
Write-Host '[seed] 3/3 — chargement des seeds ContractorCompliance...' -ForegroundColor Cyan

$smithSeed = Join-Path $migrations 'seed-contractors-from-smith.sql'
if (-not (Test-Path $smithSeed)) {
    Write-Error "[seed] Seed introuvable : $smithSeed"
}
# Le .sql charge dans c_platform_mysql / yplatformdb (mêmes creds que le .sh).
Get-Content $smithSeed -Raw | wsl -- docker exec -i c_platform_mysql mysql --default-character-set=utf8mb4 -udocker -pdocker yplatformdb
Write-Host '[seed]       seed-contractors-from-smith.sql chargé.' -ForegroundColor Green

# seed-test-missions-invoices : runner .sh (SQL + génération des PDF physiques).
$missionsSeedSh = Join-Path $migrations 'seed-test-missions-invoices.sh'
$wslPath = (wsl -- wslpath ($missionsSeedSh -replace '\\', '/'))
wsl -- bash $wslPath
Write-Host '[seed]       seed-test-missions-invoices.sh chargé.' -ForegroundColor Green

Write-Host '[seed] Terminé — base prête pour les tests Cypress real-backend.' -ForegroundColor Cyan
