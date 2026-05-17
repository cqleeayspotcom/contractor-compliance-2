# SDK Generation — frontend-tuita-contractor-compliance

## TL;DR

```bash
npm run generate-api
```

Cela régénère `src/app/api/` à partir de `openapi/contractor-compliance.openapi.yaml`.
Le SDK utilise [ng-openapi-gen](https://github.com/cyclosproject/ng-openapi-gen) v1.0.5 (Angular ≥ 14 functions API).

## Source de vérité

Le spec OpenAPI vit dans le repo :

```
openapi/contractor-compliance.openapi.yaml
```

Ce fichier est généré **manuellement** à partir des routes Laminas réelles du backend Tuita :

```
platform-backend/module/ContractorCompliance/config/domains/*.config.php
```

C'est ce backend (et lui seul) qui définit la surface réelle de l'API. Le module embarque `api-tools-documentation` côté Laminas, mais tant que l'export auto n'est pas validé bout-en-bout (chemin, complétude, alignement avec les routes post-Chantier 4c), on reste sur le YAML committé.

## Workflow recommandé

| Étape | Quand | Action |
|---|---|---|
| 1 | Une route backend change | Modifier `module/ContractorCompliance/config/domains/<n>.config.php` |
| 2 | Aligner le spec | Éditer manuellement `openapi/contractor-compliance.openapi.yaml` (ajouter/retirer le path + tag + security) |
| 3 | Régénérer le SDK | `npm run generate-api` |
| 4 | Vérifier | `git diff src/app/api/` doit refléter uniquement le changement attendu |
| 5 | Commit | Commit du `.yaml` + du SDK régénéré dans le même PR |

## Routes couvertes (résumé)

23 services, 4 modèles.

| Tag | Routes |
|---|---|
| Profile | logout, notifications, bank-details (GET/PATCH) |
| Dashboard | index, notifications/preferences (GET/POST) |
| Documents | upload, list, get/{uuid}, purchase |
| Billing | subscription, subscribe, cancel, payment-history |
| Kyc | challenge, video, status, mobile-link |
| KycMobile (public) | {token} (GET), {token}/video (POST) |
| Invoices | upload, list, show, timeline |
| InvoicesFree | eligible-missions, list, request, get, cancel, upload |
| Missions | offers, active, history, show |
| Certification | status, start, qcm/start, qcm/{attempt}/submit, qcm/{attempt}/heartbeat |
| PayPublic | show, intent, confirm (sans auth) |
| Admin* (bearer OAuth2) | settings, supervision, contractors, invoices, free-invoices, kyc, purchases, webhooks, documents, circuit-breakers, invitation-codes, dashboard, etc. |

## Stratégie d'adoption progressive

État actuel (post-2026-05-17) : **build vert**. Les 3 fichiers hand-written qui importaient des symboles SDK Laravel-era ont été nettoyés :

- `src/app/services/kyc.service.ts` — réécrit pour utiliser les 6 fonctions SDK réelles (`kycChallenge`, `kycStatus`, `kycVideo`, `kycMobileLink`, `kycMobileValidateToken`, `kycMobileSubmitVideo`). API publique du service inchangée → consommateurs (notamment `kyc-mobile.component.ts`) intacts.
- `src/app/types/api.types.ts` — ré-exports `*Resource` morts retirés, `PaginationMeta` redéfini localement.
- `src/app/models/index.ts` — idem.

**Règle d'écriture pour les nouvelles features** :
1. Pour appeler une route backend, **importer depuis `src/app/api/`** — soit la fonction standalone (`import { dashboardIndex } from '../api/fn/dashboard/dashboard-index'`), soit le service Angular `*ApiService` (`inject(DashboardApiService).dashboardIndex(...)`).
2. Ne **PAS** ajouter de nouvelle méthode dans les services hand-written de `src/app/services/` qui dupliquerait un appel HTTP déjà couvert par le SDK.
3. Les services hand-written existants restent en place tant qu'ils fonctionnent — adoption progressive, pas de big-bang.

**Types de payload** : le SDK actuel retourne `JsonObject` pour la majorité des réponses (choix délibéré, le YAML manuel ne définit pas les schémas en détail). Si un composant a besoin d'un type fort, le déclarer dans `src/app/types/api.types.ts` (types métier maison) — pas dans le SDK généré.

## Cas A — Quand utiliser l'export api-tools-documentation du backend

Lorsque le backend Tuita tournera en local et que l'export `/api-tools/api/ContractorCompliance` sera validé :

```powershell
.\scripts\fetch-openapi.ps1
```

Le script télécharge le spec dans `openapi/contractor-compliance.fetched.json`. Comparer avec le `.yaml` manuel ; si concordant, basculer `ng-openapi-gen.json > input` sur le fichier JSON pour automatiser le pipeline.

## Pourquoi ce setup hybride

- **Backend = source de vérité** (les routes Laminas).
- **YAML committé = contrat figé** revu en PR — pas de SDK qui change tout seul à cause d'un export auto buggé.
- **Script fetch = pont futur** pour la prod où le backend valide tournera.

## Régénération depuis zéro

```powershell
Remove-Item -Recurse -Force src/app/api
npm run generate-api
```

(`removeStaleFiles: true` dans `ng-openapi-gen.json` nettoie déjà les fichiers orphelins, mais reset manuel reste utile si la config est modifiée.)
