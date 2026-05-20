# Spec — Upload de justificatifs obligatoires à la demande de facture libre

- **Date :** 2026-05-20
- **Repo frontend :** `frontend-tuita-contractor-compliance` (remote `contractor-compliance-2`)
- **Repo backend :** `platform-backend`, module `ContractorCompliance` (Laminas + Doctrine)
- **Périmètre :** Étape 1 du flux facture libre uniquement — la **création de la demande**.
  Les étapes 2 (validation admin) et 3 (upload / génération de la facture) ne sont **pas** touchées.

---

## 1. Contexte et problème

Le flux « facture libre » se déroule en 3 temps : (1) le contractor crée une demande,
(2) l'admin Tuita valide, (3) la facture est uploadée (Freemium) ou générée (Pro).

À l'origine — dans l'ancien backend Laravel `tuita-verify/backend` — la création de la
demande acceptait des **justificatifs** (tickets, photos de chantier, devis). Ils étaient
stockés dans une **colonne JSON `attachments`** sur la table `free_invoice_requests`
(`'attachments' => 'array'` dans le modèle Eloquent), lus par index.

Lors du portage de l'appli vers le module `ContractorCompliance` du monolithe
`platform-backend` :

- les tables `cc_free_invoice_requests` et `cc_free_invoice_request_missions` ont été recréées ;
- un compteur `attachments_count` a survécu mais sert désormais à **autre chose** (nombre de
  factures PDF uploadées après approbation) ;
- **la colonne JSON `attachments` n'a pas été portée** — le stockage des justificatifs a disparu ;
- `FreeInvoiceService::createRequest()` a été réécrit en **JSON pur**, sans gestion de fichier.

Côté frontend, le dialog de création a été réécrit le 2026-05-20 (commit `85ef02f`) : toute
la section d'upload a été retirée, avec un commentaire actant un flux « JSON sans fichier ».

**Résultat :** le contractor ne peut plus joindre de preuve à sa demande. Tuita valide à l'aveugle.

## 2. Objectif

Restaurer l'upload de justificatifs **à la création de la demande**, des deux côtés
(frontend + backend), proprement et conforme au modèle de données actuel.

## 3. Règles métier

| Règle | Valeur |
|---|---|
| Justificatifs par demande | **≥ 1 obligatoire**, **10 maximum** |
| Formats acceptés | PDF, JPG, JPEG, PNG, WEBP |
| Taille max par fichier | 20 Mo |
| Images (JPG/PNG/WEBP) | passent par le scanner **jscanify** (recadrage) avant ajout |
| PDF | ajoutés tels quels, jamais ré-encodés |
| HEIC (photos iPhone) | **refusé** — message clair « convertis en JPG » |
| Visibilité | admin Tuita **et** contractor émetteur |

## 4. Architecture

### 4.1 Backend — nouvelle table `cc_free_invoice_justificatifs`

Nouvelle entité Doctrine `FreeInvoiceJustificatif`, calquée sur l'entité sœur existante
`FreeInvoiceRequestMission` (même module, même style de mapping annoté).

Colonnes :

| Colonne | Type | Notes |
|---|---|---|
| `id` | INT UNSIGNED, PK, AUTO | identité interne |
| `uuid` | `uuid_binary`, UNIQUE | identifiant opaque utilisé dans l'URL de téléchargement |
| `free_invoice_request_id` | INT UNSIGNED, indexé | lien vers `cc_free_invoice_requests.id` |
| `file_path` | VARCHAR(512) | chemin **relatif** sous la racine de stockage |
| `original_name` | VARCHAR(255) | nom d'origine du fichier (affichage + download) |
| `mime_type` | VARCHAR(128) | type MIME validé |
| `size_bytes` | INT UNSIGNED | taille du fichier |
| `created_at` | `datetime_immutable` | |

Constructeur : `(int $freeInvoiceRequestId, UuidInterface $uuid, string $filePath, string $originalName, string $mimeType, int $sizeBytes)`.

**Migration :** créer la table via le mécanisme de migration du module (à confirmer dans le
plan — annotations Doctrine + migration SQL, comme pour les tables `cc_*` existantes).

> **Note nommage (décision d'intégration) :** on emploie **« justificatif »**, délibérément
> distinct du terme **« attachment »** déjà utilisé dans le module pour la facture PDF finale.
> La colonne `attachments_count` et l'action admin `attachmentsView` existantes **ne sont pas
> modifiées**.

### 4.2 Backend — stockage physique des fichiers

Mêmes conventions que `FreeInvoiceService::uploadPdf()` :

- chemin relatif : `free-invoices/requests/{requestUuid}/justificatifs/{justificatifUuid}.{ext}` ;
- racine = `$this->storageRoot` (déjà injecté dans `FreeInvoiceService`) ;
- création du dossier via le helper `ensureDir()` existant ;
- `chmod 0640` après déplacement ;
- **cleanup sur échec DB** : si le `flush()` échoue après l'écriture disque, supprimer les
  fichiers orphelins (`@unlink`) — comme le fait déjà `uploadPdf()`.

Grouper par `requestUuid` évite d'avoir à résoudre le `companyId` au moment de la création.

### 4.3 Backend — création de demande en multipart

`ContractorFreeInvoiceController::requestAction()` :

- aujourd'hui : `parseJsonBody()` uniquement ;
- demain : lire les **champs texte** via `getRequest()->getPost()` et les **fichiers** via
  `getRequest()->getFiles()` quand le `Content-Type` est `multipart/form-data` ;
- `mission_refs` arrive en `mission_refs[]` → tableau dans `getPost()`.

`FreeInvoiceService::createRequest()` :

- nouvelle signature acceptant la liste des fichiers uploadés (chemins temporaires + métadonnées) ;
- valide : **≥ 1 fichier**, **≤ 10**, chaque fichier en **format autorisé** et **≤ 20 Mo** ;
- crée la `FreeInvoiceRequest` (inchangé), puis pour chaque fichier : déplace vers le stockage
  permanent et persiste une ligne `FreeInvoiceJustificatif` ;
- conserve la validation `mission_refs` existante (`validateMissionRefs`).

> Les justificatifs devenant obligatoires, une requête **JSON pure** échouera désormais en 422.
> Les scénarios e2e (`bin/e2e/.../FreeInvoiceScenario.php`) et tests unitaires concernés
> devront être adaptés pour envoyer du multipart.

### 4.4 Backend — endpoints de lecture

- **Liste des justificatifs** : enrichir `FreeInvoiceService::serialize()` d'un champ
  `justificatifs[]` : `{ uuid, original_name, mime_type, size_bytes, download_url }`.
  `serialize()` étant partagé par la liste et le détail (contractor **et** admin via
  `serializeForAdmin()`), cela couvre les deux usages d'un coup.
  - **Perf :** pour la vue liste, charger les justificatifs de toute la page en **une seule
    requête** (`WHERE free_invoice_request_id IN (...)`) afin d'éviter le N+1.
- **Téléchargement contractor** : nouvelle route
  `GET /contractor-compliance/invoices/free/:uuid/justificatifs/:jUuid`
  → `ContractorFreeInvoiceController::justificatifDownload` (vérifie que la demande appartient
  au contractor connecté).
- **Téléchargement admin** : nouvelle route
  `GET /contractor-compliance/admin/free-invoices/:uuid/justificatifs/:jUuid`
  → `AdminFreeInvoiceController::justificatifDownload`.

Routes à déclarer dans `config/domains/06-invoices-free.config.php` (enfants de `contractor-api`
et `admin-api`, contraintes UUID comme les routes voisines).

### 4.5 Frontend — dialog de création

`new-free-invoice-request-dialog.component` (`.ts` / `.html` / `.scss`) — ajouter une section
**« Justificatifs »** sous la description :

- bouton **« 📷 Prendre une photo »** : `<input type="file" accept="image/*" capture="environment">`
  — déclenche la caméra arrière sur mobile (même pattern que `onboarding-upload-stepper`) ;
- zone **glisser-déposer / parcourir** : `<input type="file" multiple
  accept=".pdf,.jpg,.jpeg,.png,.webp">` ;
- toute **image** (photo prise ou fichier choisi) passe par `DocumentScannerDialogComponent`
  (jscanify, recadrage) — composant **déjà présent dans le repo**, réutilisé tel quel ;
- les **PDF** sont ajoutés sans transformation ;
- **liste des fichiers** ajoutés (icône selon type, taille, bouton supprimer) ;
- bouton « Envoyer la demande » **désactivé tant qu'il n'y a pas ≥ 1 fichier** ;
- limites front : 10 fichiers, 20 Mo, formats ci-dessus — messages d'erreur clairs.

`free-invoice.service.ts` — `create()` :

- repasse en **`FormData` multipart** envoyé via `HttpClient` direct (pas le SDK : le SDK ne gère
  pas l'upload de fichier — `upload()` fonctionne déjà ainsi) ;
- champs : `client_name`, `amount_ttc_cents`, `description`, `mission_refs[]`, `justificatifs[]`.

Interface `FreeInvoiceRequestSummary` — ajouter
`justificatifs: { uuid; original_name; mime_type; size_bytes; download_url }[]`.

### 4.6 Frontend — carte de demande

`contractor-free-invoices.component` — sur chaque carte de demande, afficher la liste des
justificatifs avec un lien de **téléchargement** (vers la route contractor 4.4).

### 4.7 OpenAPI + SDK

- Mettre à jour `openapi/contractor-compliance.openapi.yaml` : passer le corps de
  `invoices-free-request` en `multipart/form-data`, ajouter les deux routes de téléchargement
  et le champ `justificatifs[]` dans le schéma de réponse.
- Régénérer le SDK (`ng-openapi-gen`). `create()` utilisera quand même `HttpClient` direct ;
  la régénération sert la cohérence du schéma et les modèles de réponse.

## 5. Flux de données

**Création :** Dialog → `FormData` (champs + fichiers) → `POST /invoices/free/request`
→ `requestAction()` lit post+files → `createRequest()` valide → écrit les fichiers sur disque
→ persiste `FreeInvoiceRequest` + N × `FreeInvoiceJustificatif` → renvoie l'UUID.

**Lecture :** `GET /invoices/free` ou `/invoices/free/:uuid` → `serialize()` renvoie
`justificatifs[]` avec `download_url` → la carte affiche les liens → clic →
route de téléchargement → fichier streamé.

## 6. Gestion d'erreurs

| Cas | Réponse |
|---|---|
| 0 justificatif | 422 `JUSTIFICATIFS_REQUIRED` |
| > 10 justificatifs | 422 `TOO_MANY_JUSTIFICATIFS` |
| Format non autorisé (dont HEIC) | 422 `JUSTIFICATIF_FORMAT_INVALID` |
| Fichier > 20 Mo | 422 `JUSTIFICATIF_TOO_LARGE` |
| Échec DB après écriture disque | `@unlink` des fichiers, exception remontée |

Le frontend bloque déjà ces cas en amont (UX), mais le backend reste l'autorité.

## 7. Tests

- **Backend :** test unitaire de `createRequest()` — refus si 0 fichier, refus format/taille,
  succès avec 1 et avec 10 fichiers (vérifier lignes `FreeInvoiceJustificatif` + fichiers
  disque). Mise à jour de `FreeInvoiceScenario.php` (e2e).
- **Frontend :** spec du dialog — bouton « Envoyer » désactivé à 0 fichier, ajout/suppression,
  routage des images vers le scanner, refus HEIC.

## 8. Journal d'intégration (raisonnement integrateur)

| Décision | Choix |
|---|---|
| Scanner jscanify | **Réutilisé** : `DocumentScannerDialogComponent` existant, aucune recréation |
| Entité justificatif | **Calquée** sur `FreeInvoiceRequestMission` (table enfant, même style) |
| Stockage fichier | **Calqué** sur `uploadPdf()` (chemin relatif, `ensureDir`, `chmod 0640`, cleanup) |
| Nommage | « justificatif » **distinct** de « attachment » (= facture PDF) ; `attachments_count` non touché |
| Repos `tuita-verify` | Référence d'idée **uniquement** — code périmé (ancien modèle), aucun copier-coller |
| Capture mobile | Pattern `capture="environment"` repris de `onboarding-upload-stepper` |

## 9. Hors périmètre

- Étape 2 (validation admin) et étape 3 (upload Freemium / génération Pro).
- Support HEIC.
- Toute modification du compteur `attachments_count` ou de l'action `attachmentsView`.
