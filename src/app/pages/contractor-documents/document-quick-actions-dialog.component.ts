import { Component, ChangeDetectionStrategy, inject, computed, signal, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import { PricingService } from '../../services/pricing.service';

export interface QuickActionsDialogData {
  /** SIREN du contractor tel que connu de la session courante (null s'il n'est pas encore renseigné). */
  siren: string | null;
  /** UUID + nom du justificatif VERIFIED existant (extrait INPI, KBIS ancien format ou Avis SIRENE). */
  existingDoc: { uuid: string; label: string; fileName: string } | null;
}

/**
 * Résultat du modal. Dans le cas d'un premier achat où le contractor
 * vient juste de saisir son SIREN, on le remonte au parent pour qu'il
 * puisse (a) le passer à l'API /purchase et (b) le persister en session
 * si besoin.
 */
export type QuickActionsResult =
  | { action: 'purchase'; docType: 'extrait_inpi' | 'kbis' | 'avis_sirene'; siren: string }
  | { action: 'download'; uuid: string }
  | { action: 'close' };

@Component({
  selector: 'app-document-quick-actions-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-quick-actions-dialog.component.html',
  styleUrl: './document-quick-actions-dialog.component.scss',
})
export class DocumentQuickActionsDialogComponent {
  private readonly dialogRef = inject<MatDialogRef<DocumentQuickActionsDialogComponent, QuickActionsResult>>(MatDialogRef);
  private readonly pricing = inject(PricingService);

  readonly extraitInpiPriceLabel = computed(() => this.pricing.priceLabelFor('extrait_inpi'));

  /**
   * SIREN saisi/courant du contractor. Initialisé depuis `data.siren` si déjà
   * en session ; sinon vide et le contractor renseigne dans le champ.
   */
  readonly sirenInput = signal<string>('');

  /** True tant que le SIREN courant n'est pas un bloc valide de 9 chiffres. */
  readonly hasValidSiren = computed(() => {
    const s = this.sirenInput().replace(/\s+/g, '');
    return /^\d{9}$/.test(s);
  });

  /**
   * Normalise un SIREN potentiellement bruyant (espaces non-cassables, points,
   * tirets de saisie copy-paste) en bloc de 9 chiffres. Retourne null si le
   * résultat n'a pas exactement 9 chiffres — on refuse de pré-remplir un champ
   * douteux qui pourrait déclencher un débit Stripe sur un mauvais SIREN.
   */
  private static normalizeSiren(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    return /^\d{9}$/.test(digits) ? digits : null;
  }

  /**
   * True si le contractor n'a PAS encore de SIREN en session — on doit
   * alors afficher le champ de saisie avant l'achat.
   */
  readonly needsSirenInput = computed(() => {
    return DocumentQuickActionsDialogComponent.normalizeSiren(this.data.siren) === null;
  });

  constructor(@Inject(MAT_DIALOG_DATA) public readonly data: QuickActionsDialogData) {
    const normalized = DocumentQuickActionsDialogComponent.normalizeSiren(data.siren);
    if (normalized) {
      this.sirenInput.set(normalized);
    }
  }

  /** Nettoie et n'accepte que les 9 premiers chiffres saisis. */
  onSirenChange(raw: string): void {
    const digits = (raw ?? '').replace(/\D/g, '').slice(0, 9);
    this.sirenInput.set(digits);
  }

  close(): void {
    this.dialogRef.close({ action: 'close' });
  }

  /**
   * Lance l'achat. La vérification d'authenticité du SIREN (existence,
   * radiation, correspondance avec la société déclarée) est faite par
   * le backend dans `purchaseDocument` ; la dénomination officielle est
   * ensuite affichée au contractor sur la page Stripe Checkout, ce qui
   * lui sert de confirmation finale avant débit. Aucun appel Pappers
   * automatique n'est fait à l'ouverture du modal.
   */
  purchase(docType: 'extrait_inpi' | 'kbis' | 'avis_sirene'): void {
    const siren = this.sirenInput().replace(/\s+/g, '');
    if (!/^\d{9}$/.test(siren)) return;
    this.dialogRef.close({ action: 'purchase', docType, siren });
  }

  download(): void {
    const uuid = this.data.existingDoc?.uuid;
    if (!uuid) return;
    this.dialogRef.close({ action: 'download', uuid });
  }
}
