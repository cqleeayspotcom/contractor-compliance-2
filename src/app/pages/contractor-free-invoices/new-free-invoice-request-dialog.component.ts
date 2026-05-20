import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FreeInvoiceService } from '../../services/free-invoice.service';
import { EligibleMissionsPickerComponent } from './eligible-missions-picker.component';
import {
  DocumentScannerDialogComponent,
  DocumentScannerDialogData,
  DocumentScannerDialogResult,
} from '../../components/document-scanner-dialog/document-scanner-dialog.component';

/**
 * Dialog de création d'une demande de facture libre.
 *
 * Le contractor indique QUI il facture (`client_name`), décrit la prestation
 * (`description`) ET joint ≥ 1 justificatif (ticket, photo de chantier,
 * devis) — c'est ce qui aide Tuita à valider la demande. Sur mobile, le
 * bouton « Prendre une photo » ouvre la caméra ; toute image (photo ou
 * fichier) passe par le scanner jscanify (`DocumentScannerDialogComponent`)
 * pour recadrage. Les PDF sont joints tels quels.
 *
 * À ne pas confondre avec la FACTURE PDF : elle s'uploade APRÈS l'approbation
 * Tuita, via `upload-free-invoice-dialog`.
 */
@Component({
  selector: 'app-new-free-invoice-request-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    EligibleMissionsPickerComponent,
  ],
  templateUrl: './new-free-invoice-request-dialog.component.html',
  styleUrl: './new-free-invoice-request-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewFreeInvoiceRequestDialogComponent {
  private fb = inject(FormBuilder);
  private svc = inject(FreeInvoiceService);
  private dialogRef = inject(MatDialogRef<NewFreeInvoiceRequestDialogComponent>);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  submitting = signal(false);
  missionRefs = signal<string[]>([]);
  files = signal<File[]>([]);
  isDragging = signal(false);

  static readonly DESCRIPTION_MIN = 30;
  static readonly DESCRIPTION_MAX = 5000;
  static readonly MAX_FILES = 10;
  static readonly MAX_BYTES = 20 * 1024 * 1024;
  private static readonly ACCEPTED_EXT = /\.(pdf|jpe?g|png|webp)$/i;

  form = this.fb.group({
    client_name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(200)]],
    amount_ttc: [null as number | null, [Validators.required, Validators.min(0.01)]],
    description: ['', [
      Validators.required,
      Validators.minLength(NewFreeInvoiceRequestDialogComponent.DESCRIPTION_MIN),
      Validators.maxLength(NewFreeInvoiceRequestDialogComponent.DESCRIPTION_MAX),
    ]],
  });

  // Compteur live de la description — reflète la saisie en temps réel.
  readonly descriptionLength = toSignal(
    this.form.controls.description.valueChanges.pipe(
      startWith(this.form.controls.description.value),
      map((v) => (v ?? '').length),
    ),
    { initialValue: 0 },
  );

  readonly descriptionRemaining = computed(() =>
    Math.max(0, NewFreeInvoiceRequestDialogComponent.DESCRIPTION_MIN - this.descriptionLength()),
  );

  readonly descriptionOk = computed(() =>
    this.descriptionLength() >= NewFreeInvoiceRequestDialogComponent.DESCRIPTION_MIN,
  );

  // -------------------------------------------------------------------------
  // Justificatifs
  // -------------------------------------------------------------------------

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    const picked = Array.from(input.files);
    // Reset immédiat : permet de re-sélectionner le même fichier / reprendre
    // une photo après suppression, sans attendre la fin du scanner.
    input.value = '';
    await this.addFiles(picked);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isDragging()) this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    await this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  removeFile(i: number): void {
    this.files.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  iconFor(file: File): string {
    if (file.name.toLowerCase().endsWith('.pdf')) return 'picture_as_pdf';
    if (/\.(jpe?g|png|webp)$/i.test(file.name)) return 'image';
    return 'insert_drive_file';
  }

  iconKind(file: File): 'pdf' | 'image' | 'other' {
    if (file.name.toLowerCase().endsWith('.pdf')) return 'pdf';
    if (/\.(jpe?g|png|webp)$/i.test(file.name)) return 'image';
    return 'other';
  }

  private async addFiles(incoming: File[]): Promise<void> {
    const C = NewFreeInvoiceRequestDialogComponent;

    // Tri : extension acceptée + taille ≤ 20 Mo.
    const accepted: File[] = [];
    let badExt = 0;
    let tooBig = 0;
    for (const f of incoming) {
      if (!C.ACCEPTED_EXT.test(f.name)) { badExt += 1; continue; }
      if (f.size > C.MAX_BYTES) { tooBig += 1; continue; }
      accepted.push(f);
    }
    if (badExt > 0) {
      this.snack.open(
        `${badExt} fichier(s) ignoré(s) — formats acceptés : PDF, JPG, PNG, WEBP.`,
        'OK',
        { duration: 4000 },
      );
    }
    if (tooBig > 0) {
      this.snack.open(`${tooBig} fichier(s) ignoré(s) — 20 Mo maximum par fichier.`, 'OK', { duration: 4000 });
    }

    // Capacité restante : inutile d'ouvrir le scanner pour un fichier qui
    // serait refusé par dépassement de la limite de 10.
    const remaining = C.MAX_FILES - this.files().length;
    const toProcess = accepted.slice(0, Math.max(0, remaining));
    if (accepted.length > toProcess.length) {
      this.snack.open(`Limite atteinte — ${C.MAX_FILES} justificatifs maximum.`, 'OK', { duration: 3500 });
    }

    // Les images passent au scanner jscanify une par une (l'artisan voit un
    // justificatif à la fois). Les PDF passent tels quels.
    let index = 1;
    const total = toProcess.length;
    for (const file of toProcess) {
      const processed = await this.processFile(file, index, total);
      index += 1;
      if (processed === null) continue; // annulé par l'utilisateur
      this.files.update((current) => {
        const key = `${processed.name}::${processed.size}`;
        const existing = new Set(current.map((f) => `${f.name}::${f.size}`));
        if (existing.has(key)) return current;
        if (current.length >= C.MAX_FILES) return current;
        return [...current, processed];
      });
    }
  }

  /**
   * Route un fichier vers le scanner jscanify si c'est une image. Les PDF
   * sont retournés tels quels — on ne re-encode jamais un document déjà au
   * format final.
   */
  private async processFile(file: File, index: number, total: number): Promise<File | null> {
    if (!file.type.startsWith('image/')) return file;

    const title = total > 1
      ? `Recadrer le justificatif ${index} / ${total}`
      : 'Recadrer le justificatif';
    const ref = this.dialog.open<
      DocumentScannerDialogComponent,
      DocumentScannerDialogData,
      DocumentScannerDialogResult
    >(DocumentScannerDialogComponent, {
      data: { file, title },
      panelClass: 'document-scanner-dialog-panel',
      maxWidth: '780px',
      width: '95vw',
      disableClose: true,
      autoFocus: false,
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result || result === 'cancel') return null;
    if (result === 'fallback') return file;
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'justificatif';
    return new File([result.blob], `${baseName}-scan.jpg`, { type: 'image/jpeg' });
  }

  // -------------------------------------------------------------------------

  submit(): void {
    if (this.form.invalid) {
      this.snack.open('Vérifie les champs avant d\'envoyer.', 'OK', { duration: 3000 });
      return;
    }
    if (this.files().length < 1) {
      this.snack.open('Ajoute au moins 1 justificatif (ticket, photo, devis).', 'OK', { duration: 3500 });
      return;
    }
    this.submitting.set(true);
    const v = this.form.getRawValue();
    this.svc.create({
      client_name: (v.client_name ?? '').trim(),
      description: (v.description ?? '').trim(),
      // Montant saisi en euros → centimes entiers attendus par le backend.
      amount_ttc_cents: Math.round((v.amount_ttc ?? 0) * 100),
      mission_refs: this.missionRefs(),
      justificatifs: this.files(),
    }).subscribe({
      next: () => {
        this.snack.open('Demande envoyée. Tuita va l\'examiner.', 'OK', { duration: 3500 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        const msg = err?.error?.error?.message ?? err?.error?.message ?? 'Erreur lors de l\'envoi.';
        this.snack.open(msg, 'OK', { duration: 5000 });
        this.submitting.set(false);
      },
    });
  }
}
