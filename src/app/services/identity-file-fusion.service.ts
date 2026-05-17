import { Injectable, InjectionToken, inject } from '@angular/core';
import { PDFDocument } from 'pdf-lib';

/**
 * Renderer abstrait : prend un fichier image, retourne des octets JPEG prêts
 * à être embarqués dans un PDF. Permet de découpler la logique de fusion du
 * pipeline canvas (non testable dans jsdom) → l'implémentation production
 * passe par OffscreenCanvas, les tests injectent un stub.
 */
export interface ImageRenderer {
  renderToJpeg(file: File): Promise<Uint8Array>;
}

export const IMAGE_RENDERER = new InjectionToken<ImageRenderer>('IMAGE_RENDERER', {
  providedIn: 'root',
  factory: () => new CanvasImageRenderer(),
});

const MAX_FILES = 2;
const OUTPUT_FILENAME = 'identity-document.pdf';
const OUTPUT_MIME = 'application/pdf';
const ALLOWED_MIME_PREFIX = 'image/';

/**
 * Fusionne 1 ou 2 images en un PDF mono ou bipage. Réservé strictement aux
 * pièces d'identité (CNI, titre de séjour) où le format physique est
 * recto + verso et où l'artisan prend deux photos avec son téléphone.
 *
 * NE PAS UTILISER pour les documents administratifs où l'original PDF doit
 * être préservé (KBIS, extrait INPI, URSSAF, RC, RIB, etc.) — ces documents
 * passent par l'upload single-file standard.
 */
@Injectable({ providedIn: 'root' })
export class IdentityFileFusionService {
  private readonly renderer = inject(IMAGE_RENDERER);

  async fuseToPdf(files: readonly File[]): Promise<File> {
    if (files.length === 0) {
      throw new Error('Au moins une image est requise.');
    }
    if (files.length > MAX_FILES) {
      throw new Error(`Maximum ${MAX_FILES} images.`);
    }
    for (const file of files) {
      if (!file.type.startsWith(ALLOWED_MIME_PREFIX)) {
        throw new Error(
          `Le fichier ${file.name} n'est pas une image (${file.type || 'type inconnu'}).`,
        );
      }
    }

    const pdf = await PDFDocument.create();
    for (const file of files) {
      const jpegBytes = await this.renderer.renderToJpeg(file);
      const image = await pdf.embedJpg(jpegBytes);
      const page = pdf.addPage([image.width, image.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
      });
    }
    const bytes = await pdf.save();
    return new File([new Uint8Array(bytes)], OUTPUT_FILENAME, { type: OUTPUT_MIME });
  }
}

// ---------------------------------------------------------------------------
// Production renderer — canvas-based, universal across mobile camera formats
// ---------------------------------------------------------------------------

const MAX_DIMENSION_PX = 2400; // Garde la lisibilité MRZ sans gonfler le PDF.
const JPEG_QUALITY = 0.92;

/**
 * Rend n'importe quelle image décodable par le navigateur (JPEG, PNG, WebP,
 * HEIC sur iOS Safari) en JPEG normalisé via OffscreenCanvas. Downscale à
 * 2400 px sur le grand côté pour rester sous la limite backend de 10 Mo
 * même avec 2 photos modernes (8-12 Mpx).
 */
class CanvasImageRenderer implements ImageRenderer {
  async renderToJpeg(file: File): Promise<Uint8Array> {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error(
        `Impossible de lire ${file.name}. Reprends la photo avec l'appareil photo plutôt que la galerie.`,
      );
    }

    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Le navigateur ne supporte pas la conversion d\'image.');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    return new Uint8Array(await blob.arrayBuffer());
  }
}
