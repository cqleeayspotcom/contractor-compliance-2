import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { FreeInvoiceService } from '../../services/free-invoice.service';
import { EligibleMissionsPickerComponent } from './eligible-missions-picker.component';
import {
  DocumentScannerDialogComponent,
  DocumentScannerDialogData,
  DocumentScannerDialogResult,
} from '../../components/document-scanner-dialog/document-scanner-dialog.component';

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

  files = signal<File[]>([]);
  submitting = signal(false);
  isDragging = signal(false);
  missionRefs = signal<string[]>([]);

  private static readonly MAX_FILES = 5;
  private static readonly ACCEPTED_EXT = /\.(pdf|jpe?g|png)$/i;

  static readonly JUSTIFICATION_MIN = 30;
  static readonly JUSTIFICATION_MAX = 5000;

  form = this.fb.group({
    subject: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    requested_amount_ttc: [null as number | null, [Validators.required, Validators.min(0.01)]],
    justification: ['', [
      Validators.required,
      Validators.minLength(NewFreeInvoiceRequestDialogComponent.JUSTIFICATION_MIN),
      Validators.maxLength(NewFreeInvoiceRequestDialogComponent.JUSTIFICATION_MAX),
    ]],
  });

  // Compteur live — reflète le nombre de caractères tapés en temps réel.
  readonly justificationLength = toSignal(
    this.form.controls.justification.valueChanges.pipe(
      startWith(this.form.controls.justification.value),
      map((v) => (v ?? '').length),
    ),
    { initialValue: 0 },
  );

  readonly justificationRemaining = computed(() =>
    Math.max(0, NewFreeInvoiceRequestDialogComponent.JUSTIFICATION_MIN - this.justificationLength()),
  );

  readonly justificationOk = computed(() =>
    this.justificationLength() >= NewFreeInvoiceRequestDialogComponent.JUSTIFICATION_MIN,
  );

  async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    const files = Array.from(input.files);
    // Permettre de re-sélectionner le même fichier après suppression — reset
    // tout de suite, avant l'await scanner, sinon l'utilisateur ne peut plus
    // cliquer entre-temps.
    input.value = '';
    await this.addFiles(files);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isDragging()) this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const dropped = Array.from(event.dataTransfer?.files ?? []);
    await this.addFiles(dropped);
  }

  removeFile(i: number) {
    this.files.update((arr) => arr.filter((_, idx) => idx !== i));
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  iconFor(file: File): string {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'picture_as_pdf';
    if (/\.(jpe?g|png)$/i.test(name)) return 'image';
    return 'insert_drive_file';
  }

  iconKind(file: File): 'pdf' | 'image' | 'other' {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (/\.(jpe?g|png)$/i.test(name)) return 'image';
    return 'other';
  }

  private fieldLabel(field?: string): string | null {
    if (!field) return null;
    const map: Record<string, string> = {
      subject: 'Objet',
      requested_amount_ttc: 'Montant TTC',
      justification: 'Justification',
      attachments: 'Pièces jointes',
    };
    if (map[field]) return map[field];
    if (field.startsWith('attachments.')) return 'Pièce jointe';
    return field;
  }

  private async addFiles(incoming: File[]): Promise<void> {
    const accepted = incoming.filter((f) => NewFreeInvoiceRequestDialogComponent.ACCEPTED_EXT.test(f.name));
    const rejected = incoming.length - accepted.length;
    if (rejected > 0) {
      this.snack.open(`${rejected} fichier(s) ignoré(s) - formats acceptés : PDF, JPG, PNG.`, 'OK', { duration: 3500 });
    }

    // Capacité restante avant de proposer le scanner — pas la peine d'ouvrir
    // un dialog pour un fichier qui sera de toute façon refusé par overflow.
    const remaining = NewFreeInvoiceRequestDialogComponent.MAX_FILES - this.files().length;
    const toProcess = accepted.slice(0, Math.max(0, remaining));
    if (accepted.length > toProcess.length) {
      this.snack.open(
        `Limite atteinte - ${NewFreeInvoiceRequestDialogComponent.MAX_FILES} fichiers maximum.`,
        'OK',
        { duration: 3000 },
      );
    }

    // Les PDF passent tels quels (déjà propres, le scanner client n'apporte
    // rien sauf à casser une signature électronique). Les images vont au
    // scanner séquentiellement — l'artisan voit un ticket à la fois.
    let index = 1;
    const total = toProcess.length;
    for (const file of toProcess) {
      const processed = await this.processFile(file, index, total);
      index += 1;
      if (processed === null) continue; // annulé par l'utilisateur, fichier ignoré
      this.files.update((current) => {
        const key = `${processed.name}::${processed.size}`;
        const existing = new Set(current.map((f) => `${f.name}::${f.size}`));
        if (existing.has(key)) return current;
        if (current.length >= NewFreeInvoiceRequestDialogComponent.MAX_FILES) return current;
        return [...current, processed];
      });
    }
  }

  /**
   * Route un fichier vers le scanner si c'est une image. Les PDF sont
   * retournés tels quels — règle bit-pour-bit, on ne re-encode jamais un
   * justificatif déjà au format final.
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

  submit() {
    if (this.form.invalid || this.files().length < 1) {
      this.snack.open('Vérifiez les champs et ajoutez au moins 1 pièce jointe.', 'OK', { duration: 3000 });
      return;
    }
    this.submitting.set(true);
    const fd = new FormData();
    Object.entries(this.form.value).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') fd.append(k, String(v));
    });
    this.files().forEach((f) => fd.append('attachments[]', f));
    this.missionRefs().forEach((ref, i) => fd.append(`mission_refs[${i}]`, ref));

    this.svc.create(fd).subscribe({
      next: () => {
        this.snack.open('Demande envoyée. Tuita va l\'examiner.', 'OK', { duration: 3500 });
        this.dialogRef.close(true);
      },
      error: (err) => {
        const code = err?.error?.error?.code;
        if (code === 'KYC_REQUIRED') {
          this.snack.open('Vous devez d\'abord valider votre KYC.', 'OK', { duration: 4000 });
        } else if (code === 'VALIDATION_ERROR' || err?.status === 422) {
          // Laravel renvoie { errors: { field: ["msg", ...] } } — on affiche le 1er champ KO.
          const fields = err?.error?.errors ?? {};
          const firstField = Object.keys(fields)[0];
          const firstMsg = firstField ? fields[firstField][0] : (err?.error?.message ?? 'Champs invalides');
          const label = this.fieldLabel(firstField);
          this.snack.open(label ? `${label} : ${firstMsg}` : firstMsg, 'OK', { duration: 5500 });
        } else {
          this.snack.open('Erreur : ' + (err?.error?.message ?? 'inconnue'), 'OK', { duration: 4000 });
        }
        this.submitting.set(false);
      },
    });
  }
}
