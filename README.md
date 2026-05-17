# Tuita Compliance Compliance -- Frontend Angular 21

UI pour les prestataires BTP (artisans, sous-traitants) permettant de gerer leur conformite documentaire, KYC biometrique et facturation. Integre dans l'ecosysteme `tuita.fr/contractor/*`.

## Design

L'interface reprend le style de `tuita.fr/contractor` :
- Cartes blanches sur fond gris clair
- Theme vert/bleu (couleurs Tuita)
- Typographie claire et lisible
- Mobile-first : les prestas sont sur les chantiers, ils utilisent majoritairement leur telephone

## Authentification

Pas de formulaire de login. L'authentification est geree par `tuita.fr` via le cookie `__contractor_ssid`.

| Propriete | Valeur |
|---|---|
| Cookie | `__contractor_ssid` |
| Format | Chaine hexadecimale (ex: `eb3550c225680b3fb5d1f7a8e1b4f00b`) |
| Domaine | `tuita.fr` |

Le frontend envoie `withCredentials: true` sur chaque requete API via l'intercepteur `contractorCookieInterceptor`. Si le cookie est absent ou invalide, le backend retourne 401 et le frontend redirige vers `tuita.fr/contractor`.

## Pages

| Route | Description |
|---|---|
| `/dashboard` | **Homepage en tuiles** : grille responsive `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` avec 4 tuiles statut (Documents 📄, Identité & Certif 🪪, Interventions 🔧, Factures 🧾) + 1 tuile conditionnelle « Passer en Pro ⭐ » (si plan free). Checkmark ✓/⚠/✗ par tuile avec libellés « Conforme / À compléter / Bloqué ». Plus de progress bar SVG. |
| `/documents` | Liste des documents avec filtres (statut, type) |
| `/documents/upload` | **Upload synchrone** : dropzone en haut, checklist « Documents à fournir » en bas. Le user attend le verdict (spinner jusqu'à ~60 s). Supporte drag & drop (desktop), prise de photo (mobile), HEIC (iPhone). |
| `/documents/:uuid` | Détail d'un document — l'upload étant synchrone, plus de polling OCR nécessaire (le verdict est directement dans la réponse d'upload) |
| `/kyc` | Verification video avec dual challenge (liveness + face matching) |
| `/kyc/mobile/:token` | Flow public QR code KYC (pas d'auth requise, token dans l'URL) |
| `/billing` | Selection de plan (gratuit / payant a 99.00 EUR/mois) |
| `/billing/invoices` | Gestion des factures (**upload synchrone** plan gratuit, auto plan payant) |
| `/certification` | QCM avec heartbeat (30 s) + détection d'abandon (attempt marqué `abandoned_at` après 2 min d'inactivité) |

## Upload synchrone (2026-04-22, hardcode 2026-04-24)

Les uploads `/documents/upload` et `/billing/invoices` (freemium) sont **toujours synchrones** :

- Le backend traite l'OCR + les règles métier + le verdict **dans la requête HTTP**.
- Le `HttpClient` Angular applique un **timeout de 150 s** sur ces endpoints (`SYNC_UPLOAD_TIMEOUT_MS` dans `contractor-api.service.ts`), cohérent avec la deadline PHP backend de 180 s.
- Le user voit un spinner, puis reçoit le verdict (VERIFIED / REJECTED avec `rejection_code` + message user-friendly).
- Aucun polling nécessaire côté frontend.
- Côté backend : hardcodé dans `config/compliance.php` (`'sync_upload' => true`) — plus d'env var. Les tests forcent `false` via [TestCase::setUp](../backend/tests/TestCase.php).

## Setup developpement

```bash
cd frontend
npm install
ng serve
```

Le serveur de dev demarre sur `http://localhost:4200`.

### Backend

Le backend Laravel tourne sur `http://localhost:8000` et est proxifie via `proxy.conf.json` (les appels `/api/*` sont rediriges automatiquement).

### Mode mock

Pour developper sans le backend complet, activer le mode mock dans le `.env` du backend :

```
CONTRACTOR_MOCK_ENABLED=true
```

Cela retourne des donnees fictives pour tous les endpoints `/api/contractor/*`.

## Services principaux

### `ContractorApiService`

Service central pour tous les appels API vers `/api/contractor/*`. Utilise le SDK auto-genere.

Methodes principales :
- `getDashboard()` -- Dashboard compliance complet
- `getDocuments(filters?)` -- Liste des documents avec filtres
- `uploadDocument(file, type?)` -- Upload d'un document (declenche OCR)
- `getDocumentStatus(uuid)` -- Polling statut OCR
- `purchaseKbis(siren)` -- Achat KBIS via Pappers
- `getKycChallenge()` -- Generer les challenges KYC
- `submitKycVideo(video, token)` -- Soumettre la video KYC
- `getKycStatus()` -- Polling statut KYC
- `getBillingPlan()` -- Plans disponibles
- `subscribe(plan)` -- Souscrire au plan payant
- `getInvoices(page?)` -- Liste des factures
- `uploadInvoice(file, missionRef, amount)` -- Upload facture (plan gratuit)

### `ContractorSessionService`

Gestion de l'etat de session du contractor :
- Resolution de l'identite via le cookie `__contractor_ssid`
- Cache local du profil contractor
- Gestion de l'etat du compte (`account_state`)
- Redirection vers `tuita.fr` si session invalide

### `contractorCookieInterceptor`

Intercepteur HTTP fonctionnel (Angular 21) qui :
- Ajoute `withCredentials: true` a toutes les requetes vers l'API contractor
- Intercepte les reponses 401 pour rediriger vers la page de login tuita.fr
- Ajoute le header `X-Requested-With: XMLHttpRequest`

## Structure du projet

```
frontend/
  src/
    app/
      components/       # Composants reutilisables (cards, badges, upload zone)
      pages/            # Pages par feature (dashboard, documents, kyc, billing)
      services/         # Services metier (contractor-api, session)
      guards/           # Route guards (session valide, plan requis)
      interceptors/     # HTTP interceptors (cookie auth, error handling)
    assets/             # Fichiers statiques (images, version.json)
    environments/       # Configuration par environnement
  proxy.conf.json       # Proxy dev vers le backend Laravel
  angular.json          # Configuration Angular
  package.json          # Dependances
```

## Build production

```bash
npm run build
```

Le build est deploye en tant que SPA derriere le reverse proxy Google Cloud, servant `tuita.fr/contractor/compliance/*`.

---

*Tuita Compliance Compliance -- Frontend Angular 21 -- v1.2 -- 2026-04-22*
