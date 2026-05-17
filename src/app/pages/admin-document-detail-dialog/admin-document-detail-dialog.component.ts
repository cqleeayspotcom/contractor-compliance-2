import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import {
  AdminDocumentService,
  DocumentDetail,
} from '../../services/admin-document.service';

interface ExtractedField {
  key: string;
  label: string;
  value: string;
  isObject: boolean;
  children?: ExtractedField[];
}

@Component({
  selector: 'app-admin-document-detail-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './admin-document-detail-dialog.component.html',
  styleUrl: './admin-document-detail-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDocumentDetailDialogComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminDocumentService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(
    MatDialogRef<AdminDocumentDetailDialogComponent>,
  );

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly detail = signal<DocumentDetail | null>(null);

  readonly fileLoading = signal(true);
  readonly fileError = signal<string | null>(null);
  readonly safeFileUrl = signal<SafeResourceUrl | null>(null);
  readonly imageBlobUrl = signal<string | null>(null);
  /** Internal raw blob URL kept so we can revoke it on close. */
  private rawBlobUrl: string | null = null;

  readonly extractedFields = computed<ExtractedField[]>(() => {
    const data = this.detail()?.extracted_data;
    if (!data || typeof data !== 'object') return [];
    return this.flattenFields(data, 0);
  });

  readonly statusClass = computed(() => {
    const status = this.detail()?.document.status;
    if (!status) return 'neutral';
    if (status === 'verified') return 'ok';
    if (status === 'rejected' || status === 'expired') return 'alert';
    if (status === 'legally_outdated') return 'warn';
    return 'neutral';
  });

  readonly isExpired = computed(() => {
    const expiresAt = this.detail()?.document.expires_at;
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() < Date.now();
  });

  readonly confidencePct = computed(() => {
    const c = this.detail()?.ocr_confidence;
    if (c === null || c === undefined) return null;
    const pct = c <= 1 ? c * 100 : c;
    return Math.max(0, Math.min(100, Math.round(pct)));
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly data: { uuid: string },
  ) {}

  ngOnInit(): void {
    this.loadDetail();
  }

  ngOnDestroy(): void {
    this.revokeBlobUrl();
  }

  private loadDetail(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.getDocument(this.data.uuid).subscribe({
      next: (res) => {
        this.detail.set(res.data);
        this.loading.set(false);
        // Once we know the mime type, load the file blob.
        if (res.data.document.is_pdf || res.data.document.is_image) {
          this.loadFile();
        } else {
          this.fileLoading.set(false);
        }
      },
      error: (err) => {
        this.loading.set(false);
        const msg =
          err?.error?.error?.message ??
          (err?.status === 404
            ? 'Document introuvable.'
            : err?.message === 'admin_api_key_missing'
              ? "Clé d'administration manquante. Reconnectez-vous."
              : 'Erreur lors du chargement du document.');
        this.loadError.set(msg);
        if (err?.status === 401 || err?.status === 403) {
          this.snackBar.open('Session admin expirée.', 'Fermer', {
            duration: 4000,
          });
        }
      },
    });
  }

  private loadFile(): void {
    this.fileLoading.set(true);
    this.fileError.set(null);
    this.api.downloadDocumentFile(this.data.uuid, true).subscribe({
      next: (blob) => {
        this.revokeBlobUrl();
        const url = URL.createObjectURL(blob);
        this.rawBlobUrl = url;
        const detail = this.detail();
        if (detail?.document.is_pdf) {
          this.safeFileUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        } else if (detail?.document.is_image) {
          this.imageBlobUrl.set(url);
        }
        this.fileLoading.set(false);
      },
      error: (err) => {
        this.fileLoading.set(false);
        this.fileError.set(
          err?.error?.error?.message ?? 'Aperçu indisponible.',
        );
      },
    });
  }

  /**
   * Trigger an attachment download (Content-Disposition: attachment).
   * Uses a transient anchor click on a dedicated blob to avoid stealing
   * the inline preview blob.
   */
  download(): void {
    this.api.downloadDocumentFile(this.data.uuid, false).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          this.detail()?.document.original_filename ?? `${this.data.uuid}.bin`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Defer revoke so the browser has time to start the download.
        setTimeout(() => URL.revokeObjectURL(url), 1500);
      },
      error: () => {
        this.snackBar.open('Téléchargement impossible.', 'Fermer', {
          duration: 4000,
        });
      },
    });
  }

  /** Open file in a new browser tab (uses the inline preview blob). */
  openInNewTab(): void {
    if (!this.rawBlobUrl) {
      this.snackBar.open('Aperçu indisponible.', 'Fermer', { duration: 3000 });
      return;
    }
    window.open(this.rawBlobUrl, '_blank', 'noopener');
  }

  close(): void {
    this.dialogRef.close();
  }

  private revokeBlobUrl(): void {
    if (this.rawBlobUrl) {
      URL.revokeObjectURL(this.rawBlobUrl);
      this.rawBlobUrl = null;
    }
    this.safeFileUrl.set(null);
    this.imageBlobUrl.set(null);
  }

  /**
   * Flatten an OCR extracted_data object into a list of fields. Nested
   * objects become sub-tables (one level deep). Arrays of scalars become
   * comma-separated strings ; arrays of objects are JSON-stringified.
   */
  private flattenFields(
    data: Record<string, unknown>,
    depth: number,
  ): ExtractedField[] {
    const out: ExtractedField[] = [];
    for (const [k, v] of Object.entries(data)) {
      if (v === null || v === undefined || v === '') continue;
      if (Array.isArray(v)) {
        const allScalar = v.every(
          (item) =>
            item === null ||
            ['string', 'number', 'boolean'].includes(typeof item),
        );
        out.push({
          key: k,
          label: this.humanizeKey(k),
          value: allScalar ? v.join(', ') : JSON.stringify(v),
          isObject: false,
        });
        continue;
      }
      if (typeof v === 'object') {
        if (depth >= 1) {
          out.push({
            key: k,
            label: this.humanizeKey(k),
            value: JSON.stringify(v),
            isObject: false,
          });
        } else {
          const children = this.flattenFields(
            v as Record<string, unknown>,
            depth + 1,
          );
          if (children.length > 0) {
            out.push({
              key: k,
              label: this.humanizeKey(k),
              value: '',
              isObject: true,
              children,
            });
          }
        }
        continue;
      }
      out.push({
        key: k,
        label: this.humanizeKey(k),
        value: String(v),
        isObject: false,
      });
    }
    return out;
  }

  private humanizeKey(key: string): string {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  /** Track-by helpers for *ngFor. */
  trackByKey = (_: number, f: ExtractedField): string => f.key;
  trackByUuid = (_: number, x: { uuid: string }): string => x.uuid;
}
