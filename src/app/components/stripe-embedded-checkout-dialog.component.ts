import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { loadStripe, Stripe, StripeEmbeddedCheckout } from '@stripe/stripe-js';

/**
 * Données passées au dialog via `MAT_DIALOG_DATA`.
 *
 * Ces champs proviennent de la réponse backend (`data.embedded_checkout`)
 * des endpoints `/documents/purchase`, `/documents/purchase-bundle` et
 * `/billing/subscribe`.
 */
export interface StripeEmbeddedCheckoutDialogData {
  clientSecret: string;
  publishableKey: string;
  title?: string;
  subtitle?: string;
}

/**
 * Résultat émis par `dialogRef.close(...)` :
 *
 * - `complete`  : Stripe a confirmé le paiement (callback `onComplete`).
 * - `cancelled` : l'utilisateur a cliqué sur « Annuler » / la croix ou une
 *                 erreur d'initialisation est survenue avant montage.
 */
export interface StripeEmbeddedCheckoutDialogResult {
  status: 'complete' | 'cancelled';
}

/**
 * MatDialog wrapper autour de Stripe Embedded Checkout.
 *
 * Monte l'iframe Stripe dans un conteneur `<div>` local, plutôt que de
 * rediriger vers le hosted-page — l'utilisateur reste visuellement sur
 * tuita.fr. `disableClose: true` côté MatDialog.open empêche la fermeture
 * accidentelle (clic backdrop, Escape) pendant le paiement ; la fermeture
 * reste disponible via la croix du header OU le bouton « Annuler » du
 * footer, qui appellent tous deux `cancel()` → `dialogRef.close()`
 * (programmatique, non bloqué par `disableClose`).
 */
@Component({
  selector: 'app-stripe-embedded-checkout-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stripe-embedded-checkout-dialog.component.html',
  styleUrl: './stripe-embedded-checkout-dialog.component.scss',
})
export class StripeEmbeddedCheckoutDialogComponent implements OnInit, OnDestroy {
  private readonly dialogRef =
    inject(MatDialogRef<StripeEmbeddedCheckoutDialogComponent, StripeEmbeddedCheckoutDialogResult>);
  readonly data = inject<StripeEmbeddedCheckoutDialogData>(MAT_DIALOG_DATA);

  readonly isLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  private stripe: Stripe | null = null;
  private checkout: StripeEmbeddedCheckout | null = null;
  private destroyed = false;

  async ngOnInit(): Promise<void> {
    if (!this.data.publishableKey) {
      this.errorMessage.set(
        'Configuration de paiement indisponible. Réessayez dans quelques minutes.',
      );
      this.isLoading.set(false);
      return;
    }

    if (!this.data.clientSecret) {
      this.errorMessage.set(
        'Session de paiement invalide - relancer l\'opération.',
      );
      this.isLoading.set(false);
      return;
    }

    try {
      this.stripe = await loadStripe(this.data.publishableKey);

      if (this.destroyed) {
        return;
      }

      if (!this.stripe) {
        this.errorMessage.set(
          'Impossible de charger Stripe.js - vérifier la connexion.',
        );
        this.isLoading.set(false);
        return;
      }

      // API @stripe/stripe-js >= 9 : initEmbeddedCheckout a été renommé
      // createEmbeddedCheckoutPage (signature identique, retourne toujours
      // une Promise<StripeEmbeddedCheckout>).
      this.checkout = await this.stripe.createEmbeddedCheckoutPage({
        clientSecret: this.data.clientSecret,
        onComplete: () => this.handleComplete(),
      });

      if (this.destroyed) {
        this.checkout.destroy();
        this.checkout = null;
        return;
      }

      this.checkout.mount('#stripe-embedded-root');
      this.isLoading.set(false);
    } catch (err) {
      console.error('[stripe-embedded] init failed', err);
      this.errorMessage.set(
        'Erreur lors de l\'initialisation du paiement. Réessayer.',
      );
      this.isLoading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    try {
      this.checkout?.destroy();
    } catch {
      /* iframe déjà démontée — ignorer */
    }
    this.checkout = null;
  }

  cancel(): void {
    this.dialogRef.close({ status: 'cancelled' });
  }

  private handleComplete(): void {
    this.dialogRef.close({ status: 'complete' });
  }
}
