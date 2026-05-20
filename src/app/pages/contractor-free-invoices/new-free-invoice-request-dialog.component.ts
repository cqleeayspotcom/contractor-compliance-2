import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs/operators';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FreeInvoiceService } from '../../services/free-invoice.service';
import { EligibleMissionsPickerComponent } from './eligible-missions-picker.component';

/**
 * Dialog de création d'une demande de facture libre.
 *
 * Le contractor indique QUI il veut facturer (`client_name`) et décrit la
 * prestation (`description`). Tuita approuve la demande ; le PDF de la
 * facture s'uploade ENSUITE, une fois l'accord obtenu, via
 * `upload-free-invoice-dialog`. On ne joint donc aucun fichier ici : le
 * backend `createRequest()` attend un corps JSON sans fichier.
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

  submitting = signal(false);
  missionRefs = signal<string[]>([]);

  static readonly DESCRIPTION_MIN = 30;
  static readonly DESCRIPTION_MAX = 5000;

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

  submit(): void {
    if (this.form.invalid) {
      this.snack.open('Vérifie les champs avant d\'envoyer.', 'OK', { duration: 3000 });
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
