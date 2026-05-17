import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FreeInvoiceService, FreeInvoiceRequestSummary } from '../../services/free-invoice.service';

@Component({
  selector: 'app-upload-free-invoice-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './upload-free-invoice-dialog.component.html',
  styleUrl: './upload-free-invoice-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UploadFreeInvoiceDialogComponent {
  data: FreeInvoiceRequestSummary = inject(MAT_DIALOG_DATA);
  private svc = inject(FreeInvoiceService);
  private dialogRef = inject(MatDialogRef<UploadFreeInvoiceDialogComponent>);
  private snack = inject(MatSnackBar);

  file = signal<File | null>(null);
  submitting = signal(false);

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  submit() {
    const f = this.file();
    if (!f) return;
    this.submitting.set(true);
    this.svc.upload(this.data.uuid, f).subscribe({
      next: (res) => {
        const verdict = res.data;
        const isRejected = verdict.invoice_status === 'rejected';
        const message = isRejected
          ? this.formatRejection(verdict.rejection_reason, verdict.rejection_details)
          : (verdict.message ?? 'Facture validée. En attente de la triple validation humaine Tuita.');
        this.snack.open(message, 'OK', { duration: isRejected ? 7000 : 4500 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        this.snack.open('Erreur : ' + (err?.error?.error?.message ?? 'inconnue'), 'OK', { duration: 4000 });
        this.submitting.set(false);
      },
    });
  }

  private formatRejection(reason: string | null | undefined, details: string[] | null | undefined): string {
    const head = 'Facture rejetée';
    const detail = (details && details.length > 0) ? details[0] : reason;
    return detail ? `${head} - ${detail}` : `${head}. Voir les détails sur la carte.`;
  }
}
