import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  DocumentScannerService,
  ScannerCorners,
  ScannerEngine,
  ScannerPoint,
} from '../../services/document-scanner.service';

/**
 * Données injectées dans le dialog : la `File` image à rogner + un label
 * optionnel ("recto", "ticket #2") affiché en titre pour situer l'utilisateur
 * dans un flux multi-fichiers (cas free-invoice avec 3 tickets).
 */
export interface DocumentScannerDialogData {
  file: File;
  title?: string;
}

/**
 * Résultat fermé par le dialog :
 *   - `'cancel'`  : l'artisan a cliqué "Reprendre la photo" → le flux appelant
 *                    doit revenir au file picker.
 *   - `'fallback'`: erreur scanner ou pas de détection acceptable → envoyer le
 *                    fichier original tel quel.
 *   - `{ blob }`  : aperçu validé → JPEG rogné + redressé prêt à uploader.
 */
export type DocumentScannerDialogResult =
  | 'cancel'
  | 'fallback'
  | { blob: Blob; sourceName: string };

type Side = 'topLeftCorner' | 'topRightCorner' | 'bottomLeftCorner' | 'bottomRightCorner';
const ALL_CORNERS: Side[] = [
  'topLeftCorner',
  'topRightCorner',
  'bottomLeftCorner',
  'bottomRightCorner',
];

@Component({
  selector: 'app-document-scanner-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './document-scanner-dialog.component.html',
  styleUrl: './document-scanner-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentScannerDialogComponent implements OnInit, OnDestroy {
  private readonly scanner = inject(DocumentScannerService);
  private readonly dialogRef = inject(
    MatDialogRef<DocumentScannerDialogComponent, DocumentScannerDialogResult>,
  );
  private readonly data = inject<DocumentScannerDialogData>(MAT_DIALOG_DATA);
  private readonly cdr = inject(ChangeDetectorRef);

  /**
   * États mutuellement exclusifs :
   *   - `loading`  : OpenCV.js + jscanify se chargent (premier appel ~5-10 s sur 4G)
   *   - `ready`    : image affichée, coins détectés (ou défaut), prête à valider
   *   - `editing`  : l'artisan ajuste les 4 poignées à la main
   *   - `submitting`: extraction perspective en cours (rapide mais visible)
   *   - `error`    : scanner KO → CTA fallback (envoyer la photo brute)
   */
  readonly state = signal<'loading' | 'ready' | 'editing' | 'submitting' | 'error'>(
    'loading',
  );
  readonly errorMessage = signal<string | null>(null);
  readonly title = signal<string>(this.data.title ?? 'Recadrer le document');

  /**
   * Texte d'aide adapté à l'état. Les artisans avec faible littératie
   * numérique ont besoin d'instructions explicites courtes liées à l'action
   * du moment, pas d'un blob générique.
   */
  hint(): string {
    switch (this.state()) {
      case 'editing':
        return 'Pose chaque rond orange sur un coin de la carte.';
      case 'ready':
        return 'Vérifie que la carte est bien dans la zone claire. Touche « Ajuster les bords » si besoin.';
      case 'submitting':
        return 'Préparation de la photo...';
      default:
        return '';
    }
  }

  /** Coins en COORDONNÉES IMAGE NATURELLES (px) — source de vérité. */
  readonly corners = signal<ScannerCorners | null>(null);

  /**
   * Échelle d'affichage = displayed pixels / natural pixels. Mise à jour à
   * chaque resize de la fenêtre car le canvas est responsive. Permet de
   * convertir les pointer events (display) en coords natives (image).
   */
  readonly displayScale = signal<number>(1);
  readonly displaySize = signal<{ width: number; height: number }>({ width: 0, height: 0 });

  @ViewChild('previewCanvas') private previewCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlay') private overlay?: ElementRef<HTMLDivElement>;

  private engine: ScannerEngine | null = null;
  private imageEl: HTMLImageElement | null = null;
  private objectUrl: string | null = null;
  private draggingCorner: Side | null = null;
  /**
   * Frame en attente de repaint pendant un drag. requestAnimationFrame coalesce
   * les pointermove à 60 Hz max, sinon on déclencherait un `drawImage` par
   * event (potentiellement 200+ /s sur trackpad précis), ce qui jank visible.
   */
  private pendingRepaintFrame: number | null = null;

  async ngOnInit(): Promise<void> {
    try {
      const [{ image, objectUrl }, engine] = await Promise.all([
        this.scanner.readImage(this.data.file),
        this.scanner.loadEngine(),
      ]);
      this.imageEl = image;
      this.objectUrl = objectUrl;
      this.engine = engine;

      const detected = engine.detectCorners(image);
      // Si jscanify n'a rien trouvé, on passe direct en édition : sans ça,
      // l'artisan voit un rectangle inset 5 % qu'il croit "OK" et valide une
      // photo non rognée. Le mode édition affiche les 4 poignées d'emblée et
      // dit clairement "à toi de placer les coins".
      this.corners.set(
        detected ?? this.scanner.defaultCorners({ width: image.width, height: image.height }),
      );
      this.state.set(detected ? 'ready' : 'editing');
      // `queueMicrotask` se déclenche avant qu'Angular ait rendu le canvas
      // dans le DOM (l'élément est gardé par un `@if (state === 'ready')`).
      // `setTimeout(0)` passe la frontière macrotask → CD a fini de re-render,
      // le canvas existe, on peut peindre.
      setTimeout(() => this.paintPreview(), 0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scanner indisponible.';
      this.errorMessage.set(msg);
      this.state.set('error');
    }
  }

  ngOnDestroy(): void {
    if (this.pendingRepaintFrame !== null) {
      cancelAnimationFrame(this.pendingRepaintFrame);
      this.pendingRepaintFrame = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  /**
   * Demande un repaint coalescé : 1 paint max par frame (~16 ms), même si
   * pointermove fire 200×/s. Annulé automatiquement à la destruction du dialog
   * pour éviter un crash si le composant disparaît entre deux frames.
   */
  private scheduleRepaint(): void {
    if (this.pendingRepaintFrame !== null) return;
    this.pendingRepaintFrame = requestAnimationFrame(() => {
      this.pendingRepaintFrame = null;
      this.paintPreview();
    });
  }

  /**
   * Bascule en mode édition : 4 poignées draggables apparaissent en overlay
   * sur l'aperçu. Les coins courants servent de point de départ ; aucun
   * recalcul auto.
   */
  startEditing(): void {
    if (this.state() !== 'ready') return;
    this.state.set('editing');
  }

  /** Sortie du mode édition — l'aperçu se rafraîchit avec les nouveaux coins. */
  applyEdits(): void {
    if (this.state() !== 'editing') return;
    this.state.set('ready');
    this.paintPreview();
  }

  /** Annulation utilisateur : reprendre la photo (caller ouvre à nouveau l'input). */
  cancel(): void {
    this.dialogRef.close('cancel');
  }

  /**
   * Fallback : utilisateur a un doute mais ne veut pas reprendre la photo.
   * On envoie le fichier original au backend, sans transformation. Couvre le
   * cas où la détection est totalement à côté de la plaque et l'utilisateur
   * ne sait pas placer les coins.
   */
  fallback(): void {
    this.dialogRef.close('fallback');
  }

  /**
   * Validation finale : extraction perspective vers JPEG, fermeture du dialog
   * avec le Blob. Le service downscale à 2400 px max pour respecter la limite
   * 10 Mo backend.
   */
  async confirm(): Promise<void> {
    if (this.state() !== 'ready' || !this.engine || !this.imageEl) return;
    const corners = this.corners();
    if (!corners) return;

    this.state.set('submitting');
    try {
      const size = this.scanner.computeOutputSize(corners);
      const outCanvas = this.engine.extractPaper(this.imageEl, size.width, size.height, corners);
      const blob = await this.scanner.canvasToJpegBlob(outCanvas);
      this.dialogRef.close({ blob, sourceName: this.data.file.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction impossible.';
      this.errorMessage.set(msg);
      this.state.set('error');
    }
  }

  // -------------------------------------------------------------------------
  // Preview rendering
  // -------------------------------------------------------------------------

  /**
   * Peint l'image source dans le canvas + dessine le quadrilatère des coins
   * par-dessus. Le canvas est dimensionné en taille NATURELLE de l'image ;
   * le CSS le scale pour qu'il rentre dans le dialog (mobile-first).
   */
  private paintPreview(): void {
    const canvas = this.previewCanvas?.nativeElement;
    const img = this.imageEl;
    const corners = this.corners();
    if (!canvas || !img || !corners) return;

    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Photo de fond complète
    ctx.drawImage(img, 0, 0, img.width, img.height);

    // 2. Voile sombre sur l'ensemble — rend tout ce qui est "à couper"
    //    perceptiblement plus sombre. Indispensable UX sur mobile : sans ça,
    //    l'artisan ne distingue pas la zone gardée du reste de la photo
    //    (fond table, main, ombres). Voile semi-opaque > même contraste que
    //    les apps scanner natives type CamScanner / Adobe Scan.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, img.width, img.height);

    // 3. On "redessine" la photo SEULEMENT à l'intérieur du quadrilatère
    //    pour que la zone gardée apparaisse claire et nette.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners.topLeftCorner.x, corners.topLeftCorner.y);
    ctx.lineTo(corners.topRightCorner.x, corners.topRightCorner.y);
    ctx.lineTo(corners.bottomRightCorner.x, corners.bottomRightCorner.y);
    ctx.lineTo(corners.bottomLeftCorner.x, corners.bottomLeftCorner.y);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, img.width, img.height);
    ctx.restore();

    // 4. Liseré orange autour de la zone gardée
    ctx.lineWidth = Math.max(4, img.width * 0.005);
    ctx.strokeStyle = 'rgba(255, 92, 0, 0.95)';
    ctx.beginPath();
    ctx.moveTo(corners.topLeftCorner.x, corners.topLeftCorner.y);
    ctx.lineTo(corners.topRightCorner.x, corners.topRightCorner.y);
    ctx.lineTo(corners.bottomRightCorner.x, corners.bottomRightCorner.y);
    ctx.lineTo(corners.bottomLeftCorner.x, corners.bottomLeftCorner.y);
    ctx.closePath();
    ctx.stroke();

    // 5. Petits coins renforcés (style scanner) : aide à viser, indique que
    //    les coins sont les points actifs à dragger en mode édition.
    const cornerLen = Math.max(28, img.width * 0.04);
    const cornerWidth = Math.max(6, img.width * 0.008);
    ctx.lineWidth = cornerWidth;
    ctx.strokeStyle = 'rgba(255, 92, 0, 1)';
    ctx.lineCap = 'round';
    drawCornerMark(ctx, corners.topLeftCorner, cornerLen, 1, 1);
    drawCornerMark(ctx, corners.topRightCorner, cornerLen, -1, 1);
    drawCornerMark(ctx, corners.bottomRightCorner, cornerLen, -1, -1);
    drawCornerMark(ctx, corners.bottomLeftCorner, cornerLen, 1, -1);

    this.updateDisplayScale();
  }

  /**
   * Met à jour `displayScale` et `displaySize` depuis la taille CSS du canvas.
   * Appelé au resize de la fenêtre + après chaque paint.
   */
  private updateDisplayScale(): void {
    const canvas = this.previewCanvas?.nativeElement;
    const img = this.imageEl;
    if (!canvas || !img) return;
    const rect = canvas.getBoundingClientRect();
    this.displaySize.set({ width: rect.width, height: rect.height });
    this.displayScale.set(rect.width / img.width);
    this.cdr.markForCheck();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateDisplayScale();
  }

  // -------------------------------------------------------------------------
  // Drag handles (template binds via (pointerdown))
  // -------------------------------------------------------------------------

  /**
   * Position CSS d'une poignée en pixels d'affichage (`px` du conteneur).
   * Utilisé en `[style.left.px]` / `[style.top.px]` dans le template.
   */
  handlePosition(side: Side): { left: number; top: number } {
    const corners = this.corners();
    if (!corners) return { left: 0, top: 0 };
    const scale = this.displayScale();
    const p = corners[side];
    return { left: p.x * scale, top: p.y * scale };
  }

  /** Liste itérable pour `@for` du template. */
  readonly cornerSides: readonly Side[] = ALL_CORNERS;

  onHandlePointerDown(side: Side, event: PointerEvent): void {
    if (this.state() !== 'editing') return;
    event.preventDefault();
    event.stopPropagation();
    this.draggingCorner = side;
    const target = event.target as HTMLElement;
    target.setPointerCapture(event.pointerId);
  }

  onHandlePointerMove(event: PointerEvent): void {
    if (!this.draggingCorner) return;
    event.preventDefault();
    const native = this.toNaturalCoords(event);
    if (!native) return;
    this.corners.update((c) => {
      if (!c) return c;
      return { ...c, [this.draggingCorner!]: native };
    });
    // Le canvas porte le quadrilatère orange ; sans repaint il reste figé
    // pendant que les 4 poignées se déplacent → l'artisan ne voit pas la
    // nouvelle zone de crop. On coalesce via rAF pour rester fluide.
    this.scheduleRepaint();
  }

  onHandlePointerUp(event: PointerEvent): void {
    if (!this.draggingCorner) return;
    const target = event.target as HTMLElement;
    target.releasePointerCapture?.(event.pointerId);
    this.draggingCorner = null;
  }

  /**
   * Convertit un event pointer (coords écran) → coords natives image,
   * en passant par le bounding rect du canvas et `displayScale`. Borne au
   * cadre image pour éviter de mettre un coin hors-photo (l'extraction
   * perspective marche encore mais ça produit du noir sur les bords).
   */
  private toNaturalCoords(event: PointerEvent): ScannerPoint | null {
    const canvas = this.previewCanvas?.nativeElement;
    const img = this.imageEl;
    if (!canvas || !img) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = this.displayScale();
    if (!scale) return null;
    const x = clamp((event.clientX - rect.left) / scale, 0, img.width);
    const y = clamp((event.clientY - rect.top) / scale, 0, img.height);
    return { x, y };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Trace une équerre dans un coin du quadrilatère (style apps scanner mobile :
 * deux segments courts perpendiculaires partant du coin). `dx`/`dy` donnent
 * l'orientation (1 = vers la droite/bas, -1 = vers la gauche/haut).
 */
function drawCornerMark(
  ctx: CanvasRenderingContext2D,
  p: ScannerPoint,
  len: number,
  dx: 1 | -1,
  dy: 1 | -1,
): void {
  ctx.beginPath();
  ctx.moveTo(p.x + dx * len, p.y);
  ctx.lineTo(p.x, p.y);
  ctx.lineTo(p.x, p.y + dy * len);
  ctx.stroke();
}
