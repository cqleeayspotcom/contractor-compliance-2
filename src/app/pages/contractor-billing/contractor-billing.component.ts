import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import { ContractorApiService, BillingPlan, PaymentRecord } from '../../services/contractor-api.service';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { RefreshService } from '../../services/refresh.service';
import { PricingService } from '../../services/pricing.service';
import { SkeletonComponent } from '../../components/shared/skeleton.component';
import {
  StripeEmbeddedCheckoutDialogComponent,
  StripeEmbeddedCheckoutDialogData,
  StripeEmbeddedCheckoutDialogResult,
} from '../../components/stripe-embedded-checkout-dialog.component';

interface BillingSummary {
  total_spent_eur: number;
  subscriptions_eur: number;
  purchases_eur: number;
  current_plan: string;
}

interface InvoiceYearGroup {
  year: number;
  invoices: PaymentRecord[];
  totalPaid: number;
}

@Component({
  selector: 'app-contractor-billing',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    SkeletonComponent,
  ],
  templateUrl: './contractor-billing.component.html',
  styleUrl: './contractor-billing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorBillingComponent implements OnInit {
  private readonly api = inject(ContractorApiService);
  readonly session = inject(ContractorSessionService);
  private readonly router = inject(Router);
  private readonly refreshBus = inject(RefreshService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly pricing = inject(PricingService);

  readonly plans = signal<BillingPlan[]>([]);
  readonly currentPlan = signal<string>('free');

  // Prix du plan Pro — lu depuis PricingService (source : /billing/plan,
  // backend PLAN_PRICE_EUR). Fallback 99 € si l'API échoue.
  readonly paidPlanPriceLabel = computed<string>(() => {
    const raw = this.pricing.subscriptionPriceLabel();
    // Strip le " €" final pour les usages qui le rajoutent eux-mêmes
    // dans le template (« 99 €/mois »).
    return raw.replace(/\s*€\s*$/, '');
  });
  readonly isLoading = signal(true);
  readonly isSubscribing = signal(false);
  readonly isCancelling = signal(false);
  /**
   * Polling actif après paiement Stripe (`pollUntilPlanPaid`). Pilote la
   * bannière flottante en haut de page : sans elle, le user voyait le dialog
   * Stripe se fermer puis « rien » pendant ~1-3 s en attendant le webhook,
   * et pensait que le paiement avait échoué.
   */
  readonly isPollingPlan = signal(false);
  readonly showCancelConfirm = signal(false);
  readonly cancelMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  // Historique des paiements — factures Stripe de l'abonnement Tuita Pro
  readonly subscriptionInvoices = signal<PaymentRecord[]>([]);
  readonly billingSummary = signal<BillingSummary | null>(null);
  readonly isLoadingInvoices = signal(false);

  // Regroupement par annee fiscale (secretaires/comptables raisonnent ainsi)
  // — annee la plus recente en premier, total paye par annee pour reporting
  readonly invoicesByYear = computed<InvoiceYearGroup[]>(() => {
    const groups = new Map<number, InvoiceYearGroup>();

    for (const invoice of this.subscriptionInvoices()) {
      const year = new Date(invoice.date).getFullYear();

      if (!groups.has(year)) {
        groups.set(year, { year, invoices: [], totalPaid: 0 });
      }

      const group = groups.get(year)!;
      group.invoices.push(invoice);
      if (invoice.status === 'paid') {
        group.totalPaid += invoice.amount_eur;
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.year - a.year);
  });

  // Quelles annees sont depliees — par defaut, seulement l'annee en cours
  readonly expandedYears = signal<Set<number>>(new Set([new Date().getFullYear()]));

  // Fallback plans if the API doesn't return them
  readonly fallbackPlans: BillingPlan[] = [
    {
      id: 'paid',
      name: 'Plan Professionnel',
      price_eur_month: 99.00,
      features: [
        'Tout le plan Gratuit inclus',
        'Factures auto-générées après chaque mission',
        'Rappels anticipés de documents expirants',
        'Contrat mandant Tuita',
        'Renouvellement justificatif d\'immatriculation en 1 clic',
        'Support prioritaire',
      ],
      limitations: [],
    },
    {
      id: 'free',
      name: 'Plan Gratuit',
      price_eur_month: 0,
      features: [
        'Tableau de bord de conformité',
        'Upload de documents',
        'Vérification KYC vidéo',
        `Achat d'un justificatif d'immatriculation officiel (${this.pricing.priceLabelFor('extrait_inpi')})`,
        'Suivi des missions',
      ],
      limitations: [
        'Upload de factures manuel obligatoire',
        'Pas de génération automatique de factures',
        'Pas de rappels anticipés de renouvellement',
      ],
    },
  ];

  ngOnInit(): void {
    this.loadBilling();
    this.loadSubscriptionInvoices();
    this.refreshBus.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadBilling();
        this.loadSubscriptionInvoices();
      });
  }

  loadBilling(): void {
    this.isLoading.set(true);
    this.api.getBillingPlan().subscribe({
      next: res => {
        this.currentPlan.set(res.current_plan);
        const source = res.plans.length > 0 ? res.plans : this.fallbackPlans;
        this.plans.set(this.sortFreeFirst(source));
        this.isLoading.set(false);
      },
      error: () => {
        this.plans.set(this.sortFreeFirst(this.fallbackPlans));
        this.currentPlan.set(this.session.plan);
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Charge les factures Stripe de l'abonnement Tuita Pro.
   * On filtre sur `type === 'subscription'` pour ignorer les achats Pappers
   * (KBIS, Avis SIRENE) qui sont des transactions distinctes.
   */
  loadSubscriptionInvoices(): void {
    this.isLoadingInvoices.set(true);
    this.api.getPaymentHistory().subscribe({
      next: res => {
        const subscriptionOnly = res.payments.filter(p => p.type === 'subscription');
        this.subscriptionInvoices.set(subscriptionOnly);
        this.billingSummary.set(res.summary);
        this.isLoadingInvoices.set(false);
      },
      error: () => {
        this.subscriptionInvoices.set([]);
        this.billingSummary.set(null);
        this.isLoadingInvoices.set(false);
      },
    });
  }

  private sortFreeFirst(plans: BillingPlan[]): BillingPlan[] {
    return [...plans].sort((a, b) => {
      if (a.id === 'free' && b.id !== 'free') return -1;
      if (a.id !== 'free' && b.id === 'free') return 1;
      return 0;
    });
  }

  subscribe(planId: string): void {
    // Re-entry guard : si une souscription est déjà en cours, on ignore.
    // Le bouton est aussi `[disabled]` dans le template — cette garde couvre
    // le cas d'un déclenchement programmatique (raccourci clavier, replay).
    if (this.isSubscribing()) {
      return;
    }

    this.isSubscribing.set(true);
    this.errorMessage.set(null);

    this.api.subscribe(planId).subscribe({
      next: res => {
        this.isSubscribing.set(false);
        const embedded = res.embedded_checkout;
        if (embedded?.client_secret && embedded?.publishable_key) {
          this.openStripeDialog(embedded.client_secret, embedded.publishable_key, planId);
        }
      },
      error: (err: any) => {
        this.isSubscribing.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Erreur lors de la souscription.');
      },
    });
  }

  /**
   * Ouvre le dialog Stripe Embedded Checkout pour souscrire au plan Pro.
   * Sur complétion → refresh billing (currentPlan passera à `paid` après
   * webhook Stripe + sync tuita.fr côté backend).
   */
  private openStripeDialog(
    clientSecret: string,
    publishableKey: string,
    planId: string,
  ): void {
    const plan = this.plans().find(p => p.id === planId);
    const priceLabel = plan
      ? `${this.formatPrice(plan.price_eur_month)} € / mois`
      : '';
    const ref = this.dialog.open<
      StripeEmbeddedCheckoutDialogComponent,
      StripeEmbeddedCheckoutDialogData,
      StripeEmbeddedCheckoutDialogResult
    >(StripeEmbeddedCheckoutDialogComponent, {
      width: '820px',
      maxWidth: '96vw',
      maxHeight: '90vh',
      disableClose: true,
      panelClass: 'stripe-embedded-dialog-panel',
      data: {
        clientSecret,
        publishableKey,
        title: plan ? `Souscription - ${plan.name}` : 'Souscription - Plan Pro',
        subtitle: priceLabel
          ? `Abonnement ${priceLabel}. Annulable à tout moment.`
          : 'Abonnement mensuel - annulable à tout moment.',
      },
    });

    ref.afterClosed().subscribe(result => {
      if (result?.status === 'complete') {
        // Stripe a confirmé le paiement côté client (callback onComplete).
        // Mais le webhook `checkout.session.completed` arrive sur notre backend
        // en parallèle — entre quelques dizaines de ms et ~2s après.
        // Le plan reste `free` en BDD tant que le webhook n'a pas été traité.
        // On polle `getBillingPlan` jusqu'à voir passer le plan à `paid`
        // (ou on abandonne après ~15s et on affiche un toast informatif).
        this.pollUntilPlanPaid();
      }
    });
  }

  /**
   * Polling court après paiement Stripe : attend que le webhook ait basculé
   * le plan côté BDD. Backoff progressif pour couvrir les cas où le webhook
   * Stripe est lent (très rare mais possible en cas de surcharge côté Stripe).
   */
  private pollUntilPlanPaid(): void {
    // Backoff : 0, 800 ms, 1.8 s, 3.5 s, 6 s, 10 s — total ~21 s max
    const delays = [0, 800, 1800, 3500, 6000, 10000];
    let attempt = 0;
    this.isPollingPlan.set(true);

    const tick = (): void => {
      this.api.getBillingPlan().subscribe({
        next: res => {
          this.currentPlan.set(res.current_plan);
          if (res.current_plan === 'paid') {
            // Webhook traité : on refresh tout le reste
            this.isPollingPlan.set(false);
            this.loadSubscriptionInvoices();
            this.session.refreshDashboard();
            return;
          }
          if (attempt < delays.length - 1) {
            attempt++;
            setTimeout(tick, delays[attempt]);
          } else {
            // Toujours pas passé après 21s — le webhook est probablement en
            // retard mais arrivera. On force un refresh dashboard + on
            // montre un message informatif.
            this.isPollingPlan.set(false);
            this.session.refreshDashboard();
            this.errorMessage.set(
              'Paiement reçu. Activation du plan en cours - rafraîchissez la page dans un instant.',
            );
          }
        },
        error: () => {
          // Erreur réseau transitoire → retry
          if (attempt < delays.length - 1) {
            attempt++;
            setTimeout(tick, delays[attempt]);
          } else {
            this.isPollingPlan.set(false);
          }
        },
      });
    };

    tick();
  }

  goToInvoices(): void {
    this.router.navigateByUrl('/interventions');
  }

  isCurrent(planId: string): boolean {
    return this.currentPlan() === planId;
  }

  formatPrice(price: number | null | undefined): string {
    if (price == null || price === 0) return '0';
    return price.toFixed(2).replace('.', ',');
  }

  formatInvoiceDate(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  formatInvoiceAmount(amount: number): string {
    return `${amount.toFixed(2).replace('.', ',')} €`;
  }

  /** Libelle user-friendly du statut Stripe. */
  invoiceStatusLabel(status: string): string {
    switch (status) {
      case 'paid': return 'Payée';
      case 'open': return 'En attente';
      case 'void': return 'Annulée';
      case 'uncollectible': return 'Impayée';
      case 'draft': return 'Brouillon';
      default: return status;
    }
  }

  invoiceStatusClass(status: string): string {
    switch (status) {
      case 'paid': return 'status--paid';
      case 'open':
      case 'draft': return 'status--pending';
      case 'void':
      case 'uncollectible': return 'status--failed';
      default: return 'status--pending';
    }
  }

  /**
   * Ouvre le PDF officiel Stripe dans un nouvel onglet.
   * Le lien `invoice_pdf` est signe et genere par Stripe (validite 24h).
   */
  downloadInvoicePdf(invoice: PaymentRecord): void {
    if (invoice.invoice_pdf) {
      window.open(invoice.invoice_pdf, '_blank', 'noopener,noreferrer');
    }
  }

  /** Ouvre la page Stripe hostee (facture en ligne + bouton download). */
  viewInvoiceOnline(invoice: PaymentRecord): void {
    if (invoice.invoice_url) {
      window.open(invoice.invoice_url, '_blank', 'noopener,noreferrer');
    }
  }

  // ---- Groupement par annee ----

  isYearExpanded(year: number): boolean {
    return this.expandedYears().has(year);
  }

  toggleYear(year: number): void {
    const set = new Set(this.expandedYears());
    if (set.has(year)) {
      set.delete(year);
    } else {
      set.add(year);
    }
    this.expandedYears.set(set);
  }

  expandAllYears(): void {
    this.expandedYears.set(new Set(this.invoicesByYear().map(g => g.year)));
  }

  collapseAllYears(): void {
    this.expandedYears.set(new Set());
  }

  allYearsExpanded(): boolean {
    const groups = this.invoicesByYear();
    return groups.length > 0 && groups.every(g => this.isYearExpanded(g.year));
  }

  /** "1 facture" vs "3 factures" */
  invoiceCountLabel(count: number): string {
    return count <= 1 ? `${count} facture` : `${count} factures`;
  }

  promptCancel(): void {
    this.showCancelConfirm.set(true);
  }

  dismissCancel(): void {
    this.showCancelConfirm.set(false);
  }

  confirmCancel(): void {
    this.isCancelling.set(true);
    this.errorMessage.set(null);
    this.cancelMessage.set(null);

    this.api.cancelSubscription().subscribe({
      next: res => {
        this.isCancelling.set(false);
        this.showCancelConfirm.set(false);
        this.cancelMessage.set(res.message);
        // If immediate downgrade (dev mode or no active Stripe sub)
        if (res.plan === 'free') {
          this.currentPlan.set('free');
        }
      },
      error: (err: any) => {
        this.isCancelling.set(false);
        this.errorMessage.set(err?.error?.error?.message ?? 'Erreur lors de la résiliation.');
      },
    });
  }
}
