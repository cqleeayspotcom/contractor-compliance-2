# Audit Angular Material 21 — état du theming Tuita

> Date : 2026-05-21 · Versions : `@angular/material@21.2.6`, `@angular/cdk@21.2.6`
> Déclencheur : tous les `matTooltip` s'affichaient en texte brut (cf. fix tooltip).

> **Statut : Option C appliquée le 2026-05-21.** Le tooltip est corrigé
> (`styles.scss` → `.mat-mdc-tooltip`) et le code mort de `_theme.scss` a été
> supprimé (~750 lignes ; `styles.css` 44,4 ko → 31,4 ko). Le thème Material
> reste volontairement désactivé — voir §6 option C.

---

## 1. TL;DR — l'état actuel en 3 phrases

1. **Le thème Angular Material n'est jamais appliqué.** Dans `_theme.scss`, `mat.all-component-themes()` et `mat.core-theme()` sont **commentés** (lignes 294-295). Aucun thème prebuilt, aucun `mat.theme()`, aucun `mat.core()` ailleurs.
2. **Conséquence :** les variables CSS de design (`--mat-*`, `--mdc-*`) ne sont jamais définies. Les composants Material n'ont QUE leur CSS de structure (livré automatiquement) — pas leur apparence (couleurs, fond, padding).
3. **L'app « tient » par accident :** la plupart des composants ont un rendu correct grâce à leur CSS de base + des patchs `.mat-mdc-*` ajoutés au cas par cas (dans les `.scss` de composants et dans `styles.scss`). Le tooltip a cassé franchement parce qu'il n'a **aucune** valeur de repli : son fond = `var(--mdc-plain-tooltip-container-color)` non défini → transparent.

---

## 2. Le problème de fond

`src/styles/_theme.scss` (~1040 lignes) se découpe ainsi :

| Partie | Lignes | Statut |
|---|---|---|
| Palettes couleurs + `$tuita-theme` (M2) | ~12-280 | **Inutilisé** — le thème est construit mais jamais inclus |
| `mat.core-theme` / `mat.all-component-themes` | 294-295 | **Commentés** ← cause racine |
| Overrides `.mat-*` (legacy, pré-MDC) | ~300-960 | **~70 % de code mort** (voir §3) |
| `body`, `h1-h6`, `p`, `a`, `.tuita-*` | ~1005-1050 | OK (sélecteurs CSS standards) |

**Pourquoi « code mort » ?** Angular Material 15 a migré ses composants vers MDC (Material Design Components) : la majorité des classes DOM ont été renommées `.mat-xxx` → `.mat-mdc-xxx`. `_theme.scss` a été écrit pour l'ancien nommage (Angular Material ≤ 14). En v21, ces sélecteurs ne matchent plus rien.

---

## 3. Tableau comparatif — classes legacy → MDC

Statut de chaque bloc de `_theme.scss` en Angular Material 21 :

### ❌ MORTS — le sélecteur ne matche plus rien (renommés MDC en v15)

| Composant | Sélecteur dans `_theme.scss` | Sélecteur réel v21 |
|---|---|---|
| Boutons | `.mat-button`, `.mat-stroked-button`, `.mat-flat-button`, `.mat-raised-button`, `.mat-icon-button` | `.mat-mdc-button`, `.mat-mdc-outlined-button`, `.mat-mdc-unelevated-button`, `.mat-mdc-raised-button`, `.mat-mdc-icon-button` |
| Card | `.mat-card`, `.mat-card-title/subtitle/content` | `.mat-mdc-card`, `.mat-mdc-card-title/subtitle/content` |
| Form field | `.mat-form-field`, `.mat-form-field-label/underline/ripple` | `.mat-mdc-form-field` (+ structure MDC totalement différente) |
| Input | `.mat-input-element` | `.mat-mdc-input-element` |
| Select | `.mat-select`, `.mat-select-value/arrow/panel`, `.mat-option` | `.mat-mdc-select`, `.mat-mdc-select-value/arrow`, `.mat-mdc-select-panel`, `.mat-mdc-option` |
| Checkbox | `.mat-checkbox`, `.mat-checkbox-frame/background/...` | `.mat-mdc-checkbox` (+ structure MDC différente) |
| Radio | `.mat-radio-button`, `.mat-radio-outer-circle/...` | `.mat-mdc-radio-button` |
| Dialog | `.mat-dialog-container/title/content/actions` | `.mat-mdc-dialog-container/title/content/actions` |
| Snackbar | `.mat-snack-bar-container`, `.mat-simple-snackbar` | `.mat-mdc-snack-bar-container`, `.mat-mdc-simple-snack-bar` |
| Progress bar | `.mat-progress-bar`, `.mat-progress-bar-fill/buffer` | `.mat-mdc-progress-bar` |
| Progress spinner | `.mat-progress-spinner` | `.mat-mdc-progress-spinner` |
| Tabs | `.mat-tab-group/header/label`, `.mat-ink-bar` | `.mat-mdc-tab-group/header`, `.mat-mdc-tab`, `.mdc-tab-indicator` |
| Table | `.mat-table`, `.mat-header-cell/cell/row` | `.mat-mdc-table`, `.mat-mdc-header-cell/cell/row` |
| Paginator | `.mat-paginator`, `.mat-paginator-range-label` | `.mat-mdc-paginator` |
| Chip | `.mat-chip` | `.mat-mdc-chip` (+ API chip refondue) |
| Slider | `.mat-slider`, `.mat-slider-thumb/track-*` | `.mat-mdc-slider` (**composant entièrement réécrit**, DOM incompatible) |
| Menu | `.mat-menu-item` | `.mat-mdc-menu-item` |
| List | `.mat-list`, `.mat-list-base`, `.mat-list-item`, `.mat-nav-list` | `.mat-mdc-list`, `.mat-mdc-list-item`, `.mat-mdc-nav-list` |
| Tooltip | `.mat-tooltip` | `.mat-mdc-tooltip` / `.mdc-tooltip__surface` — **✅ déjà corrigé** dans `styles.scss` |

### ✅ VIVANTS — composants NON migrés vers MDC, classes inchangées

| Composant | Sélecteur | Note |
|---|---|---|
| App background | `.mat-app-background` | Classe utilitaire, OK |
| Icon | `.mat-icon` | OK |
| Divider | `.mat-divider` | OK |
| Toolbar | `.mat-toolbar`, `.mat-toolbar-row` | OK |
| Sidenav / drawer | `.mat-drawer`, `.mat-drawer-container/backdrop` | OK |
| Expansion panel | `.mat-expansion-panel`, `.mat-expansion-panel-header/content` | OK |
| Datepicker / calendar | `.mat-calendar`, `.mat-calendar-body-*` | OK |
| Badge | `.mat-badge`, `.mat-badge-content` | OK |

### ⚠️ MIXTES — règle avec double sélecteur

`.mat-select-panel, .mat-mdc-select-panel` et `.mat-menu-panel, .mat-mdc-menu-panel` :
le 1er sélecteur est mort, le 2e (`-mdc-`) fonctionne. La règle s'applique donc partiellement.

---

## 4. Tableau comparatif — API SCSS M2 → M3

`_theme.scss` utilise l'API **Material 2** (legacy). Material 21 a pour défaut **Material 3**.
L'API M2 fonctionne encore en v21 (namespace `mat.m2-*`) mais elle est dépréciée.

| Usage | M2 — actuel dans `_theme.scss` | M3 — recommandé en v21 |
|---|---|---|
| Définir une palette | `mat.m2-define-palette($map, 800)` | `mat.define-theme()` avec palette, ou palettes système (`mat.$azure-palette`...) |
| Définir le thème | `mat.m2-define-light-theme((color, typography, density))` | `mat.define-theme((color, typography, density))` |
| Typographie | `mat.m2-define-typography-config(...)` | `typography: 'M PLUS Rounded 1c'` directement dans `mat.theme()` |
| Appliquer le thème | `@include mat.all-component-themes($theme)` | `@include mat.theme((color, typography, density))` |
| Base / reset | `@include mat.core-theme($theme)` | inclus dans `mat.theme()` |
| Élévations, base | `@include mat.core()` (manquant !) | `@include mat.elevation-classes()` + `mat.app-background()` |
| Surcharger un token | overrides manuels `.mat-xxx { ... }` | `@include mat.theme-overrides((token: valeur))` ou param `$overrides` |

> Note : `mat.core()` n'est appelé **nulle part** dans le projet. Normalement il est requis une fois pour les styles de base partagés (ripple, élévations, a11y).

---

## 5. Ce qui est cassé / à risque aujourd'hui

| Élément | Risque | Détail |
|---|---|---|
| `matTooltip` | 🔴 Cassé → **corrigé** | Fond/couleur via variables non définies. Fix global dans `styles.scss`. |
| Boutons `raised`/`flat`/`fab` | 🟠 Dégradé | Pas de remplissage couleur primaire/accent (token `--mdc-*` absent). Les `mat-icon-button` simples passent. |
| Slide-toggle, checkbox, radio | 🟠 À vérifier visuellement | Couleur « checked » = token de thème absent → peut tomber sur une couleur par défaut. |
| `mat-chip` | 🟠 À vérifier | Apparence dépend de tokens ; les classes `.mat-primary-chip` custom sont mortes (`.mat-chip` ne matche pas). |
| Progress bar / spinner | 🟠 À vérifier | Couleur de la piste = token absent. |
| Le reste | 🟢 OK | Composants non-MDC + composants avec CSS de base suffisant + patchs `.mat-mdc-*` par composant. |

**À retenir :** rien d'autre n'est *cassé net* comme le tooltip, mais plusieurs composants sont *dégradés* (pas aux couleurs Tuita). Le vrai danger est `_theme.scss` lui-même : ~700 lignes de code mort qui *donnent l'illusion* que les composants sont thémés.

---

## 6. Recommandations — 3 chemins possibles

### Option A — Réactiver le thème Material (M2)
Décommenter `mat.all-component-themes($tuita-theme)` + ajouter `mat.core()`.
- ➕ Solution générale : tous les tokens définis d'un coup, tous les composants thémés.
- ➖ Réveille ~700 lignes dormantes d'un coup → **régressions visuelles probables** partout (cards qui prennent un padding 24px, etc.). Le `TODO` ligne 293 (« Fix theme compilation ») suggère un blocage déjà rencontré — à diagnostiquer.

### Option B — Migrer vers Material 3 (`mat.theme()`)
Réécrire `_theme.scss` avec l'API M3 moderne.
- ➕ Pérenne (M3 = défaut v21+), API simple, `theme-overrides` propre.
- ➖ Plus gros chantier ; M3 change les couleurs par défaut → repasse design nécessaire.

### Option C — Garder l'approche par patchs + nettoyer ✅ APPLIQUÉE (2026-05-21)
Laisser le thème désactivé, continuer à patcher au cas par cas en `.mat-mdc-*` (comme tooltip, snackbar, form-field), et **supprimer le code mort** de `_theme.scss` (les ~20 blocs ❌ du §3), garder les 8 blocs ✅.
- ➕ Zéro régression, aligne le fichier sur la réalité, supprime le piège du code mort.
- ➖ Ne résout pas le fond (pas de thème) ; chaque nouveau composant Material devra être patché.

**Fait :** `_theme.scss` réécrit (~290 lignes au lieu de ~1040). Supprimé : tous
les blocs ❌ du §3, la définition de thème M2 inutilisée (`$tuita-theme` + palettes),
l'import `@use '@angular/material'` devenu inutile. Conservé : les 8 composants ✅,
les panneaux MDC (`.mat-mdc-select-panel`, `.mat-mdc-menu-panel`…), les classes
utilitaires `.tuita-*` et les styles globaux d'éléments HTML.

---

## 7. Checklist de vérification visuelle (à faire manuellement)

Survoler / afficher sur l'app et vérifier les couleurs Tuita :
- [ ] Tooltip (✅ corrigé)
- [ ] Bouton `mat-flat-button` / `mat-raised-button` → fond bleu/vert ?
- [ ] Checkbox / radio cochés → couleur Tuita ?
- [ ] `mat-slide-toggle` activé → couleur Tuita ?
- [ ] `mat-chip` → fond correct ?
- [ ] `mat-progress-bar` / `mat-spinner` → couleur de piste ?
- [ ] `mat-select` ouvert → panneau blanc, options OK ?
