import { Injectable, InjectionToken, inject } from '@angular/core';

/**
 * Service de scan automatique de document basé sur jscanify (OpenCV.js).
 *
 * Réservé aux photos prises au téléphone par l'artisan (CNI 2 photos guidées,
 * PJ free-invoice étape 1). Les PDF restent bit-pour-bit — un scanner client
 * sur un PDF déjà propre n'apporte rien et peut casser des signatures
 * électroniques / QR codes (cf. CLAUDE.md « intégrité forensique »).
 *
 * Architecture : OpenCV.js (~9 Mo) est chargé en lazy depuis `/opencv/opencv.js`
 * (asset statique) la première fois qu'un scanner est ouvert. Une fois en
 * cache navigateur, les ouvertures suivantes sont instantanées.
 */

export interface ScannerPoint {
  x: number;
  y: number;
}

export interface ScannerCorners {
  topLeftCorner: ScannerPoint;
  topRightCorner: ScannerPoint;
  bottomLeftCorner: ScannerPoint;
  bottomRightCorner: ScannerPoint;
}

/**
 * Moteur de scan abstrait. La production utilise jscanify + OpenCV.js ; les
 * tests injectent un stub déterministe (pas besoin de WASM 9 Mo dans jsdom).
 */
export interface ScannerEngine {
  /** Retourne les 4 coins détectés ou `null` si aucun document n'est visible. */
  detectCorners(image: HTMLImageElement | HTMLCanvasElement): ScannerCorners | null;
  /**
   * Applique une transformation perspective sur l'image source vers une sortie
   * rectangulaire de `width × height`. Retourne un canvas prêt à exporter en
   * JPEG. Les coins peuvent être ceux détectés OU ceux édités à la main par
   * l'utilisateur (drag des 4 poignées dans le dialog).
   */
  extractPaper(
    image: HTMLImageElement | HTMLCanvasElement,
    width: number,
    height: number,
    corners: ScannerCorners,
  ): HTMLCanvasElement;
}

/**
 * Token DI pour charger le moteur. Le factory production lazy-load OpenCV.js
 * et jscanify ; les tests substituent par un stub via `provide:` classique.
 */
export const SCANNER_ENGINE_LOADER = new InjectionToken<() => Promise<ScannerEngine>>(
  'SCANNER_ENGINE_LOADER',
  {
    providedIn: 'root',
    factory: () => () => loadProductionEngine(),
  },
);

const MAX_DIMENSION_PX = 2400; // Aligné sur IdentityFileFusionService.
const JPEG_QUALITY = 0.92;
const DEFAULT_PADDING_RATIO = 0.05; // 5 % de marge si pas de détection.

@Injectable({ providedIn: 'root' })
export class DocumentScannerService {
  private readonly loader = inject(SCANNER_ENGINE_LOADER);
  private enginePromise: Promise<ScannerEngine> | null = null;

  /**
   * Charge (ou retourne le cache) du moteur. Appel idempotent : la 2e fois
   * c'est instantané. À appeler tôt dans le cycle du dialog pour afficher un
   * spinner de chargement explicite à l'utilisateur.
   */
  loadEngine(): Promise<ScannerEngine> {
    if (!this.enginePromise) {
      this.enginePromise = this.loader();
    }
    return this.enginePromise;
  }

  /**
   * FIX-027 v2 — Préchargement BYTES-ONLY du script OpenCV.js (~9 Mo) sans
   * forcer la compilation WASM. On veut juste que le navigateur ait téléchargé
   * les bytes en cache (sub-resource) avant que l'utilisateur prenne sa photo,
   * pour que la compile WASM (qui bloque le main thread) ait l'air plus rapide
   * (compile-only, pas download+compile).
   *
   * À appeler dès que l'utilisateur sélectionne CNI/passeport — sans bloquer
   * son interaction. Le navigateur télécharge en parallèle pendant qu'il lit
   * "Laquelle as-tu sous la main ?" et compose son cadrage photo.
   *
   * On utilise `<link rel="prefetch">` plutôt que `<script>` direct pour
   * éviter l'évaluation immédiate (qui déclencherait la compile WASM). Le
   * prefetch met juste les bytes en cache disque/mémoire ; le `<script>`
   * sera injecté plus tard par `loadEngine()` au moment réel d'usage.
   *
   * Fire-and-forget : aucun await nécessaire, idempotent (le prefetch est
   * déjà cache-hit si déjà déclenché).
   */
  prefetchOpencvScript(): void {
    if (typeof document === 'undefined') return;
    // Skip si déjà prefetch ou déjà chargé
    if (document.querySelector('link[data-opencv-prefetch="true"]')) return;
    if ((window as unknown as { cv?: unknown }).cv) return;

    // FIX-OOM-MOBILE — Garde-fou low-memory. Sur appareils < 4 Go RAM
    // (deviceMemory) ou en mode économie de données (saveData), on
    // refuse le prefetch 9 Mo : il provoquait des OOM Samsung Internet /
    // WebView Android qui bloquaient le rendu de l'étape suivante. Le
    // chargement à la demande dans le dialog scanner reste fonctionnel.
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    if (typeof nav.deviceMemory === 'number' && nav.deviceMemory < 4) return;
    if (nav.connection?.saveData === true) return;

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'script';
    link.href = OPENCV_SCRIPT_URL;
    link.dataset['opencvPrefetch'] = 'true';
    // Pas de onload/onerror — on s'en moque, le but c'est juste le cache.
    document.head.appendChild(link);
  }

  /**
   * Décode une `File` image (JPEG/PNG/HEIC iOS si le navigateur sait) en
   * HTMLImageElement utilisable par OpenCV.js. ObjectURL retourné pour qu'on
   * puisse aussi l'afficher dans un `<img>` de preview et le révoquer après.
   */
  async readImage(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
    if (!file.type.startsWith('image/')) {
      throw new Error(`${file.name} n'est pas une image.`);
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`Impossible de décoder ${file.name}.`));
        image.src = objectUrl;
      });
    } catch (err) {
      URL.revokeObjectURL(objectUrl);
      throw err;
    }
    return { image, objectUrl };
  }

  /** Export du canvas vers un Blob JPEG. Wrappe `canvas.toBlob` en Promise. */
  canvasToJpegBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Export JPEG impossible.'))),
        'image/jpeg',
        quality,
      );
    });
  }

  /**
   * Calcule les dimensions de sortie idéales depuis 4 coins quelconques :
   *   width  = max(côté haut, côté bas)
   *   height = max(côté gauche, côté droit)
   * Bornée à `MAX_DIMENSION_PX` sur le grand côté pour rester sous la limite
   * backend 10 Mo, même sur un APN 12 Mpx.
   */
  computeOutputSize(corners: ScannerCorners): { width: number; height: number } {
    const top = distance(corners.topLeftCorner, corners.topRightCorner);
    const bottom = distance(corners.bottomLeftCorner, corners.bottomRightCorner);
    const left = distance(corners.topLeftCorner, corners.bottomLeftCorner);
    const right = distance(corners.topRightCorner, corners.bottomRightCorner);
    let width = Math.max(top, bottom);
    let height = Math.max(left, right);
    if (!isFinite(width) || width <= 0) width = 1;
    if (!isFinite(height) || height <= 0) height = 1;
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  /**
   * Coins par défaut si la détection auto échoue : un rectangle légèrement
   * inset par rapport à l'image (5 % de marge). L'utilisateur ajustera à la
   * main via les 4 poignées du dialog.
   */
  defaultCorners(size: { width: number; height: number }): ScannerCorners {
    const padX = size.width * DEFAULT_PADDING_RATIO;
    const padY = size.height * DEFAULT_PADDING_RATIO;
    return {
      topLeftCorner: { x: padX, y: padY },
      topRightCorner: { x: size.width - padX, y: padY },
      bottomLeftCorner: { x: padX, y: size.height - padY },
      bottomRightCorner: { x: size.width - padX, y: size.height - padY },
    };
  }
}

function distance(a: ScannerPoint, b: ScannerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ---------------------------------------------------------------------------
// Production loader — OpenCV.js + jscanify, lazy-loaded
// ---------------------------------------------------------------------------

const OPENCV_SCRIPT_URL = '/opencv/opencv.js';
const OPENCV_INIT_TIMEOUT_MS = 12_000; // 12 s : au-delà l'utilisateur croit que c'est bloqué.

async function loadProductionEngine(): Promise<ScannerEngine> {
  console.debug('[scanner] ensureOpencvLoaded() start');
  await ensureOpencvLoaded();
  const cv = getReadyCv();
  console.debug('[scanner] OpenCV ready, importing jscanify…');
  const jscanifyModule: { default?: new () => unknown } = await import('jscanify/client');
  console.debug('[scanner] jscanify imported, building engine');
  const JscanifyCtor = (jscanifyModule.default ?? jscanifyModule) as new () => {
    findPaperContour(mat: unknown): unknown;
    getCornerPoints(contour: unknown): Partial<ScannerCorners>;
    extractPaper(
      image: HTMLImageElement | HTMLCanvasElement,
      width: number,
      height: number,
      corners?: ScannerCorners,
    ): HTMLCanvasElement | null;
  };
  const instance = new JscanifyCtor();

  return {
    detectCorners(image) {
      const mat = cv.imread(image);
      try {
        const contour = instance.findPaperContour(mat);
        if (!contour) return null;
        const raw = instance.getCornerPoints(contour);
        if (
          !raw.topLeftCorner ||
          !raw.topRightCorner ||
          !raw.bottomLeftCorner ||
          !raw.bottomRightCorner
        ) {
          return null;
        }
        return raw as ScannerCorners;
      } finally {
        mat.delete?.();
      }
    },
    extractPaper(image, width, height, corners) {
      const out = instance.extractPaper(image, width, height, corners);
      if (!out) {
        throw new Error('Extraction du document impossible avec les coins fournis.');
      }
      return out;
    },
  };
}

interface OpencvLike {
  imread(image: HTMLImageElement | HTMLCanvasElement): { delete?: () => void };
}

interface OpencvGlobals {
  cv?: OpencvLike & { then?: (cb: (v: OpencvLike) => void) => void };
  Module?: {
    onRuntimeInitialized?: () => void;
    [k: string]: unknown;
  };
}

/**
 * Charge OpenCV.js (~9 Mo) la première fois, no-op les fois suivantes.
 *
 * **Pattern d'init** — canonique Emscripten :
 *  1. On pré-positionne `window.Module = { onRuntimeInitialized: ... }` AVANT
 *     que le `<script>` ne s'exécute. Le wrapper opencv.js fait
 *     `if (typeof Module === 'undefined') Module = {}` puis lance le boot WASM
 *     en utilisant CE Module → notre callback est appelé dès que le runtime
 *     est prêt et que `cv.imread`, `cv.Mat`, etc. sont peuplés sur `window.cv`.
 *  2. En filet, polling de `cv.imread` toutes les 80 ms (cas re-ouverture où
 *     le runtime est déjà initialisé d'une session précédente → le callback
 *     ne se redéclenche pas) jusqu'à `OPENCV_INIT_TIMEOUT_MS`.
 *
 * **⚠ Piège thenable Emscripten — À LIRE AVANT DE TOUCHER À CETTE FONCTION**
 *
 * Le Module Emscripten d'opencv.js expose `Module["then"]` (donc `window.cv.then`
 * est une fonction). Si une Promise est résolue *avec* cv comme valeur — y
 * compris implicitement via `return cv` depuis une `async function` — le moteur
 * JS traite cv comme un thenable et appelle `cv.then(resolve)`. Ce `then`
 * Emscripten, appelé après runtime déjà initialisé, ne callback parfois pas
 * → tout `await` en aval reste bloqué indéfiniment (bug reproduit 2026-05-14
 * en local et en staging).
 *
 * **Règle** : cette fonction retourne `Promise<void>` (pas `Promise<OpencvLike>`),
 * résout sans payload (`resolve()` tout court), et le caller relit `window.cv`
 * synchroniquement via {@link getReadyCv}. NE JAMAIS `return cv` depuis une
 * async function ni passer cv à `Promise.resolve()`.
 */
async function ensureOpencvLoaded(): Promise<void> {
  const w = window as unknown as OpencvGlobals;

  // Déjà initialisé d'une session précédente ?
  if (w.cv && typeof (w.cv as OpencvLike).imread === 'function') {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve();
    };

    const tryResolve = (): boolean => {
      const cv = w.cv;
      if (cv && typeof cv.imread === 'function') {
        finish();
        return true;
      }
      return false;
    };

    // (1) Hook avant injection — chaîné si quelqu'un en avait déjà posé un.
    const previousHook = w.Module?.onRuntimeInitialized;
    w.Module = w.Module ?? {};
    w.Module.onRuntimeInitialized = () => {
      console.debug('[scanner] Module.onRuntimeInitialized fired');
      if (typeof previousHook === 'function') {
        try {
          previousHook();
        } catch {
          /* on n'interfère pas avec le hook étranger */
        }
      }
      // Le runtime vient de finir : `cv.imread` doit être là maintenant.
      tryResolve();
    };

    // (2) Injection du script (idempotente : un seul tag dans le DOM).
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-opencv="true"]`,
    );
    if (!existing) {
      console.debug('[scanner] injecting <script src="/opencv/opencv.js">');
      const script = document.createElement('script');
      script.src = OPENCV_SCRIPT_URL;
      script.async = true;
      script.dataset['opencv'] = 'true';
      script.onload = () => {
        console.debug(
          '[scanner] script onload — window.cv present?',
          !!w.cv,
          'imread?',
          typeof (w.cv as OpencvLike | undefined)?.imread,
        );
      };
      script.onerror = () =>
        finish(new Error('OpenCV.js : impossible de charger /opencv/opencv.js.'));
      document.head.appendChild(script);
    } else {
      console.debug('[scanner] opencv script tag already present in DOM');
    }

    // (3) Filet de polling : cas re-open où le runtime serait déjà prêt
    //     (le hook ne se redéclenchera pas) ou Module.onRuntimeInitialized
    //     qui ne fire pas dans certains builds. Pas de `cv.then(...)` ici —
    //     on évite tout contact avec le thenable Emscripten (cf. note ci-dessus).
    const tick = () => {
      if (settled) return;
      if (tryResolve()) return;
      if (Date.now() - start > OPENCV_INIT_TIMEOUT_MS) {
        finish(new Error('OpenCV.js : initialisation trop longue. Vérifie ta connexion.'));
        return;
      }
      setTimeout(tick, 80);
    };
    tick();
  });

  console.debug('[scanner] inner promise resolved, returning from ensureOpencvLoaded');
}

/**
 * Récupère `window.cv` après {@link ensureOpencvLoaded}. Ne JAMAIS faire
 * passer cv via une `Promise.resolve(cv)` ou un `return cv` depuis une async
 * function — cf. note ci-dessus sur l'assimilation thenable.
 */
function getReadyCv(): OpencvLike {
  const cv = (window as unknown as OpencvGlobals).cv;
  if (!cv || typeof cv.imread !== 'function') {
    throw new Error('OpenCV.js chargé mais cv.imread indisponible.');
  }
  return cv as OpencvLike;
}
