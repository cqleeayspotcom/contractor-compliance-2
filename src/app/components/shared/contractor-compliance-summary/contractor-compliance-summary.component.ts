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
 * Snapshot compliance d'un contractor — panneau réutilisable côté backoffice admin.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE COMPOSANT A ÉTÉ CRÉÉ (2026-05-04)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Avant ce composant, un admin Tuita pouvait approuver une demande de facture
 * libre de 120 € (ou rejouer un achat Pappers, ou marquer une facture payée)
 * sans aucune visibilité sur l'état réel du contractor en face. Le dialog
 * affichait juste "Nom + Société + SIREN + Téléphone" — rien sur le KYC,
 * rien sur les documents URSSAF/RC/Décennale, rien sur l'historique de
 * factures rejetées.
 *
 * Conséquences possibles d'une décision à l'aveugle :
 *  - Payer un contractor dont le KYC n'a jamais été validé (= identité non
 *    prouvée → risque de fraude / litige avec l'URSSAF côté Tuita).
 *  - Payer un contractor avec une URSSAF expirée depuis 6 mois (en BTP, c'est
 *    Tuita qui devient solidairement responsable d'un travail dissimulé).
 *  - Rater le signal "ce contractor a 50 factures rejetées en 30 j" (pattern
 *    suspect).
 *
 * D'où ce composant : un panneau qui charge en un seul appel HTTP toutes les
 * infos administratives critiques pour décider, et qui les présente en 4 blocs
 * (identité / 3 metrics colonnes / docs critiques) avec un verdict de risque
 * coloré en haut (ok / warning / danger).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI EST AFFICHÉ
 * ────────────────────────────────────────────────────────────────────────────
 *
 *  1. Bandeau de risque global — calcul automatique :
 *       danger  : KYC manquant/rejeté OU document critique manquant/rejeté
 *       warning : tout valid mais 1+ doc expiré OU compliance < 100 %
 *       ok      : KYC approuvé + tous docs critiques verts + 100 %
 *
 *  2. Identité — Nom, Société, SIREN, Téléphone (masqué via PhoneMasker côté
 *     backend pour ne pas leak la PII en clair dans les logs réseau), Plan
 *     (pill verte si Pro, grise si Free).
 *
 *  3. 3 metrics en colonnes :
 *       - KYC : statut + score face match + dernière tentative + raison échec
 *       - Compliance : score 0-100 % + date dernière validation
 *       - Factures : total / payées / en cours / rejetées
 *
 *  4. Documents critiques — 8 types affichés en cards avec badge couleur :
 *     EXTRAIT_INPI · KBIS · AVIS_SIRENE · URSSAF · ASSURANCE_RC ·
 *     ASSURANCE_DECENNALE · RIB · CNI. Chaque card indique "À jour" / "Expiré
 *     il y a X j" / "Rejeté" / "Manquant".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * COMMENT ÇA FONCTIONNE TECHNIQUEMENT
 * ────────────────────────────────────────────────────────────────────────────
 *
 *  - 1 seul appel HTTP : `GET /contractor-compliance/admin/contractors/{phone}/compliance-summary`
 *    Le backend (AdminInvoiceStatsController::contractorComplianceSummary) agrège
 *    KYC + Documents (latest version) + Prestataire (compliance_score) + Invoices
 *    (compteurs by_status) en un seul payload pré-mappé (libellés FR, badges,
 *    dates ISO) → le frontend n'a rien à transformer.
 *
 *  - Le composant gère lui-même son loading / error → l'appelant n'a qu'à passer
 *    le téléphone, c'est tout.
 *
 *  - `riskLevel` est un `computed()` signal → recalculé automatiquement quand
 *    le snapshot arrive, pilote la bordure colorée à gauche (vert/ambre/orange).
 *
 *  - OnPush + signals → coût de re-render minimal même si embarqué dans un
 *    dialog qui change beaucoup d'état.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * OÙ C'EST DÉJÀ BRANCHÉ (2026-05-04)
 * ────────────────────────────────────────────────────────────────────────────
 *
 *  - admin-free-invoices/admin-free-invoice-detail-dialog
 *      → contexte avant approve/reject d'une demande de facture libre
 *  - admin-purchases/purchase-detail-dialog
 *      → contexte avant retry / refund d'un achat Pappers
 *
 * Pages volontairement exclues (pour ne pas dupliquer) :
 *  - admin-invoices : a déjà son propre bloc "Contractor 360°" inline car le
 *    show endpoint des invoices retourne le contractor_context dans le même
 *    payload → pas d'aller-retour HTTP supplémentaire.
 *  - admin-contractor : c'EST la page profil contractor, ce serait redondant.
 *  - admin-document-detail-dialog : lecture seule (politique zero-manuel),
 *    pas de décision financière.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * USAGE
 * ────────────────────────────────────────────────────────────────────────────
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
 * Si le téléphone est nullable (cas où la session n'a pas été restaurée), guard
 * avec un @if pour éviter un appel inutile :
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

  // Tag computed pour mettre en évidence un risque global d'un coup d'œil :
  //  - "danger" : pas de KYC OU document critique manquant/rejeté
  //  - "warning" : KYC OK mais 1+ doc expiré ou compliance < 100
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
        return 'Contractor à jour — pas de blocage compliance.';
      case 'warning':
        return 'Quelques points d\'attention — vérifiez avant validation.';
      case 'danger':
        return 'Risque élevé — KYC ou documents critiques manquants/rejetés.';
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
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  }

  docStatusLabel(doc: { badge: ComplianceBadge; status: string; days_until_expiry: number | null }): string {
    switch (doc.badge) {
      case 'ok': return 'À jour';
      case 'expired': {
        const hint = this.expiryHint(doc.days_until_expiry);
        return hint ? `Expiré (${hint})` : 'Expiré';
      }
      case 'ko': return 'Rejeté';
      case 'missing': return 'Manquant';
      case 'pending': return 'En cours';
      default: return doc.status;
    }
  }

  expiryHint(daysUntilExpiry: number | null): string | null {
    if (daysUntilExpiry === null) return null;
    if (daysUntilExpiry < 0) {
      const abs = Math.abs(Math.round(daysUntilExpiry));
      return `Expiré il y a ${abs} j`;
    }
    const days = Math.round(daysUntilExpiry);
    if (days === 0) return 'Expire aujourd\'hui';
    if (days <= 30) return `Expire dans ${days} j`;
    return null;
  }
}
