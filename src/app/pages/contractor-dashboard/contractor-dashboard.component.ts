import { Component, ChangeDetectionStrategy, OnInit, inject, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

import { ContractorSessionService } from '../../services/contractor-session.service';
import { ContractorDashboard } from '../../services/contractor-api.service';
import { PushProService } from '../../services/push-pro.service';
import { PricingService } from '../../services/pricing.service';
import { OnboardingBannerComponent } from '../../components/shared/onboarding-banner/onboarding-banner.component';
import { HelpDialogComponent } from '../../components/shared/help-dialog/help-dialog.component';
import { UrgencyDialogService } from '../../components/shared/urgency-dialog/urgency-dialog.service';

type TileStatus = 'ok' | 'warn' | 'bad';

/** Fenêtre de pré-alerte expiration : aligné sur la page /documents. */
const EXPIRY_WARN_DAYS = 30;

@Component({
  selector: 'app-contractor-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    OnboardingBannerComponent,
  ],
  templateUrl: './contractor-dashboard.component.html',
  styleUrl: './contractor-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorDashboardComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly pushProService = inject(PushProService);
  private readonly urgencyDialog = inject(UrgencyDialogService);
  private readonly destroyRef = inject(DestroyRef);
  readonly session = inject(ContractorSessionService);
  private readonly pricing = inject(PricingService);

  /** Label de prix abonnement Pro (« 99 €/mois » par défaut). */
  proPriceLabel(): string {
    return this.pricing.subscriptionPriceLabel();
  }

  // Observable-based state (template keeps the async pipe for loading/error)
  readonly dashboard$ = this.session.dashboard$;
  readonly isLoading$ = this.session.isLoading$;
  readonly error$ = this.session.error$;

  // Signal mirror used by the computed statuses below.
  readonly dashboard = toSignal<ContractorDashboard | null>(this.session.dashboard$, {
    initialValue: null,
  });

  // ---------------------------------------------------------------------------
  // Computed tile statuses
  // ---------------------------------------------------------------------------

  /**
   * Documents administratifs — status synthèse.
   * - ok : tous vérifiés
   * - bad : au moins un rejeté ou expiré (bloque la conformité)
   * - warn : il manque des pièces ou upload en cours
   */
  readonly documentsStatus = computed<TileStatus>(() => {
    const docs = this.dashboard()?.documents;
    if (!docs) return 'warn';
    if (docs.rejected > 0 || docs.expired > 0) return 'bad';
    if (this.expiringSoonCount() > 0) return 'warn';
    if (docs.total_required > 0 && docs.verified === docs.total_required) return 'ok';
    return 'warn';
  });

  /**
   * Nombre de documents `verified` dont l'expiration tombe dans la fenêtre
   * de pré-alerte (≤ 30 j). Sans ce signal, la tuile « Documents » reste verte
   * jusqu'à la bascule effective `expired` — alors qu'à ce moment-là le
   * webhook `compliance.invalidated` a déjà repassé `canRun=false` côté
   * tuita.fr. On veut prévenir, pas constater.
   */
  readonly expiringSoonCount = computed<number>(() => {
    const items = this.dashboard()?.documents?.items ?? [];
    return items.filter(
      (it) =>
        it.status === 'verified' &&
        it.days_until_expiry !== null &&
        it.days_until_expiry <= EXPIRY_WARN_DAYS,
    ).length;
  });

  /**
   * Plus petit `days_until_expiry` parmi les docs en pré-alerte — sert au
   * libellé « expire dans X j » quand un seul document est concerné.
   */
  readonly expiringSoonMinDays = computed<number | null>(() => {
    const items = this.dashboard()?.documents?.items ?? [];
    const days = items
      .filter(
        (it) =>
          it.status === 'verified' &&
          it.days_until_expiry !== null &&
          it.days_until_expiry <= EXPIRY_WARN_DAYS,
      )
      .map((it) => it.days_until_expiry as number);
    return days.length === 0 ? null : Math.min(...days);
  });

  /**
   * FIX-045 — Compte les docs expirés (status='expired'), pour bandeau
   * alerte ROUGE sur la home dashboard. Sans ce signal, l'artisan ne voit
   * son doc EXPIRED qu'en allant manuellement sur /documents alors que
   * ses missions sont déjà bloquées (webhook compliance.invalidated parti).
   */
  readonly expiredCount = computed<number>(() => {
    const items = this.dashboard()?.documents?.items ?? [];
    return items.filter((it) => it.status === 'expired').length;
  });

  /**
   * Libellé du 1er doc expiré pour la bannière "X expiré : faut le racheter".
   */
  readonly firstExpiredLabel = computed<string | null>(() => {
    const items = this.dashboard()?.documents?.items ?? [];
    const first = items.find((it) => it.status === 'expired');
    return first?.label ?? null;
  });

  /**
   * Identité (KYC uniquement — la certification a sa propre tuile).
   * - ok : KYC approved
   * - bad : KYC rejected
   * - warn : autre (à faire / en cours)
   */
  readonly identityStatus = computed<TileStatus>(() => {
    const kyc = this.dashboard()?.kyc?.status;
    if (kyc === 'rejected') return 'bad';
    if (kyc === 'approved') return 'ok';
    return 'warn';
  });

  /**
   * Tuile identité verrouillée tant que CNI/passeport n'est pas VERIFIED.
   *
   * Miroir visuel de la garde backend dans ContractorKycController::challenge()
   * qui refuse de générer le challenge KYC sans document d'identité vérifié.
   * Sans ce verrou UI, l'utilisateur cliquerait "Commencer" pour se prendre
   * une 422 et un message d'erreur au moment le moins opportun.
   *
   * Ne verrouille pas après un KYC déjà réalisé (approved/rejected/processing) —
   * le document d'identité a forcément été validé à ce stade.
   */
  readonly identityLocked = computed<boolean>(() => {
    const d = this.dashboard();
    if (!d) return true;
    const kyc = d.kyc?.status;
    if (kyc === 'approved' || kyc === 'rejected' || kyc === 'processing') {
      return false;
    }
    return !d.kyc?.identity_doc_verified;
  });

  /**
   * Certification Tuita (QCM + aide-mémoire).
   * Verrouillée tant que le KYC n'est pas approved.
   * - ok : certifié (clic → /certification/memo)
   * - warn : KYC OK, QCM à passer (clic → /certification)
   * - bad : jamais utilisé ici (verrouillée = état visuel distinct via certificationLocked)
   */
  readonly certificationStatus = computed<TileStatus>(() => {
    const d = this.dashboard();
    if (!d) return 'warn';
    if (d.kyc?.status !== 'approved') return 'warn';
    if (d.certification?.completed) return 'ok';
    return 'warn';
  });

  /**
   * Tuile certification verrouillée quand l'identité n'est pas encore vérifiée.
   * Pilote le CSS (`.tile--locked`) et désactive la navigation côté template.
   */
  readonly certificationLocked = computed<boolean>(() => {
    return this.dashboard()?.kyc?.status !== 'approved';
  });

  /**
   * Tuile « Mes chantiers » — fusion Interventions + Factures.
   *
   * Statut consolidé = pire des deux pour rendre lisible d'un coup d'œil :
   *   - `bad`  si au moins une facture rejetée (action urgente)
   *   - `warn` si interventions à facturer OU factures en cours de validation
   *   - `ok`   sinon
   *
   * Verrouillée tant que `account_state !== 'fully_verified'` — sans ça,
   * `canRun=false` côté tuita.fr et le contractor ne peut ni recevoir de
   * mission ni émettre de facture, la zone n'a aucun sens.
   */
  readonly chantiersStatus = computed<TileStatus>(() => {
    const d = this.dashboard();
    if (!d) return 'warn';
    const inv = d.invoices;
    // Une facture refusée n'est pas bloquante (l'artisan peut la corriger
    // et la re-soumettre) → "À compléter" plutôt que "Bloqué". On réserve
    // `bad` aux états réellement bloqués (chantiersLocked gère déjà ce cas).
    if (inv?.rejected && inv.rejected > 0) return 'warn';
    const invoiceable = d.missions?.invoiceable ?? 0;
    const inFlight =
      (inv?.validating ?? 0) +
      (inv?.pending_payment_validation ?? 0) +
      (inv?.ready_to_pay ?? 0) +
      (inv?.payment_in_progress ?? 0);
    if (invoiceable > 0 || inFlight > 0) return 'warn';
    return 'ok';
  });

  readonly chantiersLocked = computed<boolean>(() => {
    return this.dashboard()?.account_state !== 'fully_verified';
  });

  readonly chantiersSubtitle = computed<string>(() => {
    const d = this.dashboard();
    if (!d) return '';
    if (d.account_state !== 'fully_verified') {
      return 'Complète ton compte d\'abord';
    }
    const invoiceable = d.missions?.invoiceable ?? 0;
    const inv = d.invoices;
    if (inv?.rejected && inv.rejected > 0) {
      return `${inv.rejected} facture${inv.rejected > 1 ? 's' : ''} refusée${inv.rejected > 1 ? 's' : ''}`;
    }
    const inFlight =
      (inv?.validating ?? 0) +
      (inv?.pending_payment_validation ?? 0) +
      (inv?.ready_to_pay ?? 0) +
      (inv?.payment_in_progress ?? 0);
    const parts: string[] = [];
    if (invoiceable > 0) {
      parts.push(`${invoiceable} à facturer`);
    }
    if (inFlight > 0) {
      parts.push(`${inFlight} en cours`);
    }
    if (parts.length === 0) {
      const total = d.missions?.completed ?? 0;
      if (total === 0) return 'Pas encore de mission';
      return 'Tes interventions';
    }
    return parts.join(' • ');
  });

  readonly showProUpsell = computed<boolean>(() => {
    return this.dashboard()?.billing?.plan === 'free';
  });

  /**
   * Vrai tant qu'une action d'onboarding est attendue (`next_action` non
   * `none`). Permet de masquer les tuiles « Mes documents » + « Mon identité »
   * pendant l'inscription : on garde l'attention sur le bandeau Bienvenu et
   * son CTA unique. Les autres tuiles (Certification, Chantiers) restent
   * visibles mais affichent leur cadenas — pas en concurrence avec le CTA.
   */
  readonly onboardingActive = computed<boolean>(() => {
    const action = this.dashboard()?.next_action;
    return !!action && action !== 'none';
  });

  readonly firstName = computed<string>(() => {
    return this.dashboard()?.contractor?.firstName ?? '';
  });

  readonly currentPlan = computed<'free' | 'paid'>(() => {
    return this.dashboard()?.billing?.plan ?? 'free';
  });

  /**
   * Tuile certification : mémo passif. Cachée par défaut — l'artisan
   * accède au rappel via le menu si besoin. Règle UX : ne pas afficher
   * une tuile sans action concrète, ça surcharge la home.
   */
  readonly showCertificationTile = computed<boolean>(() => false);

  /**
   * Tuile identité : visible UNIQUEMENT quand il y a quelque chose à
   * faire ET hors onboarding. Pendant l'onboarding, le bandeau Bienvenu
   * pilote déjà l'upload CNI + KYC via son CTA unique « Commencer » → afficher
   * en plus une tuile verrouillée qui pointe vers la même destination
   * crée deux portes d'entrée concurrentes (anti low-literacy).
   * Une fois `identityStatus === 'ok'`, on cache aussi — pas de tuile
   * passive « Identité vérifiée » qui ne mène à rien.
   */
  readonly showIdentityTile = computed<boolean>(() => {
    if (this.onboardingActive()) return false;
    return this.identityLocked() || this.identityStatus() !== 'ok';
  });

  /**
   * Tuile documents : cachée pendant l'onboarding pour la même raison que
   * l'identité — le bandeau Bienvenu route déjà vers `/documents/upload`,
   * pas besoin d'un doublon. Visible dès que l'onboarding est terminé pour
   * servir de porte d'entrée vers la gestion / renouvellement des pièces.
   */
  readonly showDocumentsTile = computed<boolean>(() => {
    return !this.onboardingActive();
  });

  /**
   * Tuile chantiers : TOUJOURS visible. C'est la porte d'entrée vers
   * les missions et les factures — le contractor doit pouvoir y accéder
   * même quand 0 mission / 0 facture (état d'attente normal). Cacher
   * cette tuile bloquerait l'accès au cœur de l'app.
   */
  readonly showChantiersTile = computed<boolean>(() => true);

  /**
   * Ordre des tuiles : chantiers en 1er (zone la plus consultée au quotidien)
   * sauf si les documents demandent une action — dans ce cas on les remonte
   * pour ne pas que l'artisan rate la pièce manquante / expirée.
   * Pendant l'onboarding, la tuile documents est cachée → l'ordre n'a pas
   * d'effet visible.
   */
  readonly chantiersFirst = computed<boolean>(() => {
    return this.documentsStatus() === 'ok';
  });

  /**
   * Tuile « Mon abonnement Pro » : cachée quand l'utilisateur est déjà
   * Pro — pas d'action requise, le chip « Plan Pro » dans le header
   * sert déjà de point d'entrée vers la gestion des factures Stripe.
   */
  readonly showAbonnementProTile = computed<boolean>(() => false);


  // ---------------------------------------------------------------------------
  // Sub-titles per tile (courtes, orientées action)
  // ---------------------------------------------------------------------------

  readonly documentsSubtitle = computed<string>(() => {
    // Sous-titres courts (≤ 4 mots quand possible). Le badge au-dessus de la
    // tuile porte déjà l'icône statut, le sous-titre dit juste le compte.
    const docs = this.dashboard()?.documents;
    if (!docs) return '...';
    if (docs.rejected > 0) {
      return `${docs.rejected} refusé${docs.rejected > 1 ? 's' : ''}`;
    }
    if (docs.expired > 0) {
      return `${docs.expired} expiré${docs.expired > 1 ? 's' : ''}`;
    }
    const expiring = this.expiringSoonCount();
    if (expiring > 0) {
      if (expiring === 1) {
        const days = this.expiringSoonMinDays() ?? 0;
        if (days <= 0) return 'Expire aujourd’hui';
        if (days === 1) return 'Expire demain';
        return `Expire dans ${days} j`;
      }
      return `${expiring} expirent bientôt`;
    }
    if (docs.total_required === 0) return 'Rien à fournir';
    return `${docs.verified}/${docs.total_required} validés`;
  });

  readonly identitySubtitle = computed<string>(() => {
    const d = this.dashboard();
    if (!d) return '...';
    const kyc = d.kyc?.status;
    if (kyc === 'rejected') return 'Refusée - à refaire';
    if (kyc === 'processing') return 'Analyse en cours';
    if (kyc === 'approved') return 'Vérifiée';
    if (!d.kyc?.identity_doc_verified) {
      return 'CNI ou passeport à déposer';
    }
    return 'Vidéo à enregistrer';
  });

  readonly certificationSubtitle = computed<string>(() => {
    const d = this.dashboard();
    if (!d) return '...';
    if (d.kyc?.status !== 'approved') return 'Après identité validée';
    if (d.certification?.completed) return 'Certifié ✓';
    return 'QCM à passer (24 questions)';
  });

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    if (this.pushProService.shouldShow()) {
      setTimeout(() => {
        if (this.pushProService.shouldShow()) {
          this.pushProService.show(this.dialog);
        }
      }, 800);
    }

    // Dialog urgence : on attend que le dashboard soit chargé avant de
    // déclencher (sinon `next_action` est null et on ne montre rien).
    // Petit delay pour ne pas écraser l'animation d'entrée. Cooldown de
    // 30 min géré côté UrgencyDialogService via localStorage.
    this.session.dashboard$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((d) => {
        if (!d) return;
        setTimeout(() => {
          this.urgencyDialog.showIfNeeded(d.next_action, d.contractor?.firstName ?? '');
        }, 1200);
      });
  }

  // ---------------------------------------------------------------------------
  // Status label mapping (affiché dans le badge)
  // ---------------------------------------------------------------------------

  statusLabel(status: TileStatus): string {
    switch (status) {
      case 'ok':   return 'Conforme';
      case 'warn': return 'À compléter';
      case 'bad':  return 'Bloqué';
    }
  }

  statusIcon(status: TileStatus): string {
    switch (status) {
      case 'ok':   return 'check';
      case 'warn': return 'priority_high';
      case 'bad':  return 'close';
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation — Identité & Certification
  // ---------------------------------------------------------------------------

  identityRoute(): string {
    return '/kyc';
  }

  /**
   * Route ciblée par la tuile « Mes documents » selon ce qu'il y a à faire :
   * - tout est OK et rien n'expire bientôt → `/documents` (liste avec
   *   téléchargement). Le stepper n'a pas d'utilité ici, l'artisan veut
   *   juste consulter ses pièces.
   * - quelque chose à faire (manquant, rejeté, expiré, expire bientôt) →
   *   `/documents/upload` (stepper assisté qui se positionne sur la pièce
   *   à traiter).
   */
  documentsRoute(): string {
    const status = this.documentsStatus();
    if (status === 'ok') {
      return '/documents';
    }
    return '/documents/upload';
  }

  certificationRoute(): string {
    return this.dashboard()?.certification?.completed ? '/certification/memo' : '/certification';
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  retry(): void {
    this.session.refreshDashboard();
  }


  /**
   * Modal d'aide global — bouton "?" dans le header. Cible artisan / secrétaire
   * qui ne maîtrisent pas le vocabulaire (KBIS, URSSAF, RC pro, etc.) :
   * explique le parcours, où trouver chaque doc, et qui contacter en cas de
   * blocage. Laisse l'UI principale épurée pour les utilisateurs pressés.
   */
  openHelp(): void {
    this.dialog.open(HelpDialogComponent, {
      width: '640px',
      maxWidth: '96vw',
      maxHeight: '85vh',
      autoFocus: false,
      restoreFocus: true,
      panelClass: 'help-dialog-panel',
    });
  }
}
