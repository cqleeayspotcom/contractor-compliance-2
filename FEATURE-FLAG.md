# Feature flag `CONTRACTOR_COMPLIANCE_ENABLED` — Frontend

## Pourquoi

Le module backend Laminas `ContractorCompliance` est piloté par la variable
d'env `CONTRACTOR_COMPLIANCE_ENABLED`. Quand elle vaut `0` en prod, le
module n'est pas chargé et toutes les routes `/contractor-compliance/*`
retournent 404.

Pour rester cohérent côté UI, ce frontend embarque un flag miroir
`contractorComplianceEnabled` :

- Flag **ON** → l'app charge normalement, les requêtes API partent.
- Flag **OFF** → tout est rabattu sur `/service-unavailable` (écran statique
  "Service temporairement indisponible" + bouton retour Tuita), AUCUNE
  requête HTTP `/contractor-compliance/*` n'est tentée.

## Comment activer / désactiver

### Sources du flag (par ordre de priorité)

1. **Runtime override** : `/assets/feature-flags.json` (servi par le
   container nginx en prod, fichier statique en dev). Modifiable **à chaud
   sans rebuild**.
2. **Build-time** : `src/environments/environment.ts` (dev) et
   `environment.prod.ts` (prod). Sert de fallback si le JSON runtime est
   absent / illisible.

### Valeurs par défaut

| Source | Valeur | POURQUOI |
|---|---|---|
| `environment.ts` (dev) | `true` | Le module est toujours dispo en local. |
| `environment.prod.ts` (prod) | `false` | Opt-in explicite — la prod doit *prouver* qu'elle veut activer. |
| `src/assets/feature-flags.json` | `true` | Sert de override par défaut, doit être réécrit à la livraison. |

### Procédure d'urgence (kill-switch à chaud)

En prod GCP Cloud Run, pas besoin de redéployer :

1. Remplacer le contenu de `/assets/feature-flags.json` servi par le
   container (via volume monté, override nginx, ou rebuild seul du fichier)
   par :
   ```json
   { "contractorComplianceEnabled": false }
   ```
2. Invalider le cache CDN si nécessaire.
3. Les nouveaux clients qui chargent l'app verront le JSON mis à jour au
   `APP_INITIALIZER` et seront immédiatement rabattus sur
   `/service-unavailable`.

Le rollback est symétrique : remettre `true` et invalider le cache.

## Architecture

| Fichier | Rôle |
|---|---|
| `src/environments/environment.ts` / `environment.prod.ts` | Valeurs build-time du flag. |
| `src/assets/feature-flags.json` | Override runtime (modifiable sans rebuild). |
| `src/app/services/feature-flags.service.ts` | Charge le JSON au boot via `APP_INITIALIZER`, expose `isContractorComplianceEnabled()`. |
| `src/app/guards/feature-flag.guard.ts` | `canActivate` → rabat sur `/service-unavailable` si flag OFF. Appliqué sur `/` et `/dashboard`. |
| `src/app/interceptors/feature-flag.interceptor.ts` | Court-circuite les requêtes `/contractor-compliance/*` avec une erreur synthétique 503 si flag OFF. Second rempart au cas où le guard est by-passé. |
| `src/app/pages/service-unavailable/service-unavailable.component.ts` | Écran statique affiché quand flag OFF. |
| `src/app/app.config.ts` | Ordre d'initialisation : FeatureFlags d'abord, puis ContractorSession et Pricing (qui skip si flag OFF). |

## Comportement attendu quand le flag est OFF

- `/` → redirect → `featureFlagGuard` → `/service-unavailable`
- `/dashboard` → `featureFlagGuard` → `/service-unavailable`
- Toute requête HTTP vers `/contractor-compliance/*` → 503 synthétique
  (sans appel réseau).
- `APP_INITIALIZER` `initContractorSession` et `initPricing` : no-op.
- Le bouton "Retour à Tuita" sur l'écran service-unavailable renvoie vers
  `environment.tuitaBackendUrl` (ou `https://tuita.fr` en fallback).

## Tester localement

```bash
# Cas nominal (flag ON, défaut en dev)
npm start

# Simuler le flag OFF côté runtime sans toucher l'env
# 1. Modifier src/assets/feature-flags.json :
#    { "contractorComplianceEnabled": false }
# 2. Recharger l'app dans le navigateur → écran service-unavailable

# Vérifier que le build production fonctionne
npm run build
```
