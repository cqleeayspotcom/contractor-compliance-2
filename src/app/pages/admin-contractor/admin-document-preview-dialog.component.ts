import {
  Component,
  ChangeDetectionStrategy,
  Inject,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import {
  AdminContractorService,
  ContractorDocumentRow,
} from '../../services/admin-contractor.service';

/**
 * Modal preview admin pour un document uploadé par le contractor.
 *
 * Le fichier est stocké chiffré sur S3 et streamé via un endpoint admin
 * protégé par X-Tuita-Admin-Key (header). On ne peut donc pas pointer un
 * <iframe src="..."> direct cross-origin — on fetch un Blob avec le header,
 * puis on injecte un object URL dans l'iframe / img.
 *
 * Object URLs revoke()'d en ngOnDestroy pour ne pas leaker.
 */
@Component({
  selector: 'app-admin-document-preview-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './admin-document-preview-dialog.component.html',
  styleUrl: './admin-document-preview-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDocumentPreviewDialogComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminContractorService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly loading = signal<boolean>(true);
  readonly errorMsg = signal<string | null>(null);
  readonly safeUrl = signal<SafeResourceUrl | null>(null);
  readonly mimeType = signal<string | null>(null);
  private rawObjectUrl: string | null = null;

  constructor(
    public ref: MatDialogRef<AdminDocumentPreviewDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public row: ContractorDocumentRow,
  ) {}

  ngOnInit(): void {
    this.api.fetchDocumentBlob(this.row.uuid, true).subscribe({
      next: (blob) => {
        const mime = blob.type || this.row.mime_type || 'application/octet-stream';
        this.mimeType.set(mime);
        this.rawObjectUrl = URL.createObjectURL(blob);
        this.safeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.rawObjectUrl));
        this.loading.set(false);
      },
      error: (err: { status?: number }) => {
        this.loading.set(false);
        if (err.status === 404) {
          this.errorMsg.set('Fichier introuvable sur le stockage.');
        } else if (err.status === 413) {
          this.errorMsg.set('Document trop volumineux pour la prévisualisation.');
        } else if (err.status === 401 || err.status === 403) {
          this.errorMsg.set('Session admin expirée.');
        } else {
          this.errorMsg.set('Erreur de chargement du document.');
        }
      },
    });
  }

  ngOnDestroy(): void {
    if (this.rawObjectUrl) {
      URL.revokeObjectURL(this.rawObjectUrl);
      this.rawObjectUrl = null;
    }
  }

  isPdf(): boolean {
    return (this.mimeType() ?? '').includes('pdf');
  }

  isImage(): boolean {
    return (this.mimeType() ?? '').startsWith('image/');
  }

  /**
   * Téléchargement = on déclenche un fetch séparé attachment + ouvre le blob.
   * Le simple <a download> ne marche pas avec un endpoint header-protected.
   */
  download(): void {
    this.api.fetchDocumentBlob(this.row.uuid, false).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.row.original_filename ?? `${this.row.uuid}.pdf`;
        a.click();
        // Laisser le navigateur démarrer le download avant revoke
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: () => {
        this.errorMsg.set('Erreur de téléchargement.');
      },
    });
  }

  close(): void {
    this.ref.close();
  }
}
