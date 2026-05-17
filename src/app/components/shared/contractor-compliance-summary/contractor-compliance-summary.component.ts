import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import {
  AdminContractorComplianceService,
  ComplianceBadge,
  ComplianceSummary,
} from '../../../services/admin-contractor-compliance.service';
import { PhoneDisplayPipe } from '../../../pipes/phone-display.pipe';

/**
 * Snapshot compliance d'un contractor â€” panneau rÃ©utilisable cÃ´tÃ© backoffice admin.
 *
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * POURQUOI CE COMPOSANT A Ã‰TÃ‰ CRÃ‰Ã‰ (2026-05-04)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * Avant ce composant, un admin Tuita pouvait approuver une demande de facture
 * libre de 120 â‚¬ (ou rejouer un achat Pappers, ou marquer une facture payÃ©e)
 * sans aucune visibilitÃ© sur l'Ã©tat rÃ©el du contractor en face. Le dialog
 * affichait juste "Nom + SociÃ©tÃ© + SIREN + TÃ©lÃ©phone" â€” rien sur le KYC,
 * rien sur les documents URSSAF/RC/DÃ©cennale, rien sur l'historique de
 * factures rejetÃ©es.
 *
 * ConsÃ©quences possibles d'une dÃ©cision Ã  l'aveugle :
 *  - Payer un contractor dont le KYC n'a jamais Ã©tÃ© validÃ© (= identitÃ© non
 *    prouvÃ©e â†’ risque de fraude / litige avec l'URSSAF cÃ´tÃ© Tuita).
 *  - Payer un contractor avec une URSSAF expirÃ©e depuis 6 mois (en BTP, c'est
 *    Tuita qui devient solidairement responsable d'un travail dissimulÃ©).
 *  - Rater le signal "ce contractor a 50 factures rejetÃ©es en 30 j" (pattern
 *    suspect).
 *
 * D'oÃ¹ ce composant : un panneau qui charge en un seul appel HTTP toutes les
 * infos administratives critiques pour dÃ©cider, et qui les prÃ©sente en 4 blocs
 * (identitÃ© / 3 metrics colonnes / docs critiques) avec un verdict de risque
 * colorÃ© en haut (ok / warning / danger).
 *
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * CE QUI EST AFFICHÃ‰
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 *  1. Bandeau de risque global â€” calcul automatique :
 *       danger  : KYC manquant/rejetÃ© OU document critique manquant/rejetÃ©
 *       warning : tout valid mais 1+ doc expirÃ© OU compliance < 100 %
 *       ok      : KYC approuvÃ© + tous docs critiques verts + 100 %
 *
 *  2. IdentitÃ© â€” Nom, SociÃ©tÃ©, SIREN, TÃ©lÃ©phone (masquÃ© via PhoneMasker cÃ´tÃ©
 *     backend pour ne pas leak la PII en clair dans les logs rÃ©seau), Plan
 *     (pill verte si Pro, grise si Free).
 *
 *  3. 3 metrics en colonnes :
 *       - KYC : statut + score face match + derniÃ¨re tentative + raison Ã©chec
 *       - Compliance : score 0-100 % + date derniÃ¨re validation
 *       - Factures : total / payÃ©es / en cours / rejetÃ©es
 *
 *  4. Documents critiques â€” 8 types affichÃ©s en cards avec badge couleur :
 *     EXTRAIT_INPI Â· KBIS Â· AVIS_SIRENE Â· URSSAF Â· ASSURANCE_RC Â·
 *     ASSURANCE_DECENNALE Â· RIB Â· CNI. Chaque card indique "Ã€ jour" / "ExpirÃ©
 *     il y a X j" / "RejetÃ©" / "Manquant".
 *
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * COMMENT Ã‡A FONCTIONNE TECHNIQUEMENT
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 *  - 1 seul appel HTTP : `GET /contractor-compliance/admin/contractors/{phone}/compliance-summary`
 *    Le backend (AdminInvoiceStatsController::contractorComplianceSummary) agrÃ¨ge
 *    KYC + Documents (latest version) + Prestataire (compliance_score) + Invoices
 *    (compteurs by_status) en un seul payload prÃ©-mappÃ© (libellÃ©s FR, badges,
 *    dates ISO) â†’ le frontend n'a rien Ã  transformer.
 *
 *  - Le composant gÃ¨re lui-mÃªme son loading / error â†’ l'appelant n'a qu'Ã  passer
 *    le tÃ©lÃ©phone, c'est tout.
 *
 *  - `riskLevel` est un `computed()` signal â†’ recalculÃ© automatiquement quand
 *    le snapshot arrive, pilote la bordure colorÃ©e Ã  gauche (vert/ambre/orange).
 *
 *  - OnPush + signals â†’ coÃ»t de re-render minimal mÃªme si embarquÃ© dans un
 *    dialog qui change beaucoup d'Ã©tat.
 *
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * OÃ™ C'EST DÃ‰JÃ€ BRANCHÃ‰ (2026-05-04)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 *  - admin-free-invoices/admin-free-invoice-detail-dialog
 *      â†’ contexte avant approve/reject d'une demande de facture libre
 *  - admin-purchases/purchase-detail-dialog
 *      â†’ contexte avant retry / refund d'un achat Pappers
 *
 * Pages volontairement exclues (pour ne pas dupliquer) :
 *  - admin-invoices : a dÃ©jÃ  son propre bloc "Contractor 360Â°" inline car le
 *    show endpoint des invoices retourne le contractor_context dans le mÃªme
 *    payload â†’ pas d'aller-retour HTTP supplÃ©mentaire.
 *  - admin-contractor : c'EST la page profil contractor, ce serait redondant.
 *  - admin-document-detail-dialog : lecture seule (politique zero-manuel),
 *    pas de dÃ©cision financiÃ¨re.
 *
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * USAGE
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 *
 * @example
 * ```ts
 * // Dans le component
 * imports: [..., ContractorComplianceSummaryComponent],
 * ```
 * ```html
 * <!-- Dans le template (phone format prod = "P33756874218") -->
 * <app-contractor-compliance-summary [phone]="contractorPhone" />
 * ```
 *
 * Si le tÃ©lÃ©phone est nullable (cas oÃ¹ la session n'a pas Ã©tÃ© restaurÃ©e), guard
 * avec un @if pour Ã©viter un appel inutile :
 * ```html
 * @if (contractor.phone; as p) {
 *   <app-contractor-compliance-summary [phone]="p" />
 * }
 * ```
 */
@Component({
  selector: 'app-contractor-compliance-summary',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule, MatDividerModule, PhoneDisplayPipe],
  templateUrl: './contractor-compliance-summary.component.html',
  styleUrl: './contractor-compliance-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorComplianceSummaryComponent {
  private svc = inject(AdminContractorComplianceService);

  loading = signal(true);
  error = signal<string | null>(null);
  summary = signal<ComplianceSummary | null>(null);

  // Tag computed pour mettre en Ã©vidence un risque global d'un coup d'Å“il :
  //  - "danger" : pas de KYC OU document critique manquant/rejetÃ©
  //  - "warning" : KYC OK mais 1+ doc expirÃ© ou compliance < 100
  //  - "ok"     : tout est vert
  riskLevel = computed<'ok' | 'warning' | 'danger'>(() => {
    const s = this.summary();
    if (!s) return 'warning';
    if (s.kyc.badge === 'ko' || s.kyc.badge === 'missing') return 'danger';
    if (s.documents.some((d) => d.badge === 'ko' || d.badge === 'missing')) return 'danger';
    if (s.documents.some((d) => d.badge === 'expired')) return 'warning';
    if (!s.compliance.is_fully_compliant) return 'warning';
    return 'ok';
  });

  riskMessage = computed(() => {
    switch (this.riskLevel()) {
      case 'ok':
        return 'Contractor Ã  jour â€” pas de blocage compliance.';
      case 'warning':
        return 'Quelques points d\'attention â€” vÃ©rifiez avant validation.';
      case 'danger':
        return 'Risque Ã©levÃ© â€” KYC ou documents critiques manquants/rejetÃ©s.';
    }
  });

  @Input({ required: true })
  set phone(value: string) {
    if (!value) return;
    this.load(value);
  }

  private load(phone: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.summary(phone).subscribe({
      next: (r) => {
        this.summary.set(r.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Impossible de charger le statut du contractor.');
        this.loading.set(false);
      },
    });
  }

  badgeIcon(badge: ComplianceBadge): string {
    return ({
      ok: 'check_circle',
      pending: 'hourglass_empty',
      ko: 'error',
      expired: 'schedule',
      missing: 'remove_circle',
      unknown: 'help',
    } as Record<ComplianceBadge, string>)[badge];
  }

  formatDate(iso: string | null): string {
    if (!iso) return 'â€”';
    try {
      return new Date(iso).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return 'â€”';
    }
  }

  docStatusLabel(doc: { badge: ComplianceBadge; status: string; days_until_expiry: number | null }): string {
    switch (doc.badge) {
      case 'ok': return 'Ã€ jour';
      case 'expired': {
        const hint = this.expiryHint(doc.days_until_expiry);
        return hint ? `ExpirÃ© (${hint})` : 'ExpirÃ©';
      }
      case 'ko': return 'RejetÃ©';
      case 'missing': return 'Manquant';
      case 'pending': return 'En cours';
      default: return doc.status;
    }
  }

  expiryHint(daysUntilExpiry: number | null): string | null {
    if (daysUntilExpiry === null) return null;
    if (daysUntilExpiry < 0) {
      const abs = Math.abs(Math.round(daysUntilExpiry));
      return `ExpirÃ© il y a ${abs} j`;
    }
    const days = Math.round(daysUntilExpiry);
    if (days === 0) return 'Expire aujourd\'hui';
    if (days <= 30) return `Expire dans ${days} j`;
    return null;
  }
}
