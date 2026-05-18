import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiConfiguration } from '../api/api-configuration';
import { unwrapData } from '../api/unwrap';
import { adminContractorsComplianceSummary } from '../api/fn/admin-contractors/admin-contractors-compliance-summary';

/**
 * Service d'accès au snapshot compliance d'un contractor (admin only).
 *
 * Pourquoi : alimente le composant `ContractorComplianceSummaryComponent` qui
 * sert à donner à l'admin tout le contexte nécessaire AVANT de prendre une
 * décision financière (approuver une facture libre, retry un achat, marquer
 * une facture payée). Cf. la docblock du composant pour le détail métier.
 *
 * Endpoint backend :
 *   GET /contractor-compliance/admin/contractors/{phone}/compliance-summary
 *   Header X-Tuita-Admin-Key : injecté globalement (cf. interceptor admin) —
 *   plus géré ici depuis la migration SDK 2026-05-17.
 *
 * Format de retour : un payload plat, pré-mappé (libellés FR, badges déjà
 * calculés côté serveur) → le composant n'a rien à transformer.
 */

/**
 * Code de statut retourné par le backend pour chaque "ligne" affichable
 * (KYC ou Document). Le mapping vers une icône Material est géré côté composant.
 */
export type ComplianceBadge = 'ok' | 'pending' | 'ko' | 'expired' | 'missing' | 'unknown';

export interface ComplianceSummary {
  identity: {
    phone_masked: string;
    first_name: string | null;
    last_name: string | null;
    siren: string | null;
    company_name: string | null;
    plan: 'free' | 'paid' | string;
    account_state: string | null;
  };
  kyc: {
    status: string;
    status_label: string;
    badge: ComplianceBadge;
    last_attempted_at: string | null;
    face_match_score: number | null;
    failure_reason: string | null;
    retry_count: number;
  };
  compliance: {
    score: number | null;
    global_status: string | null;
    is_fully_compliant: boolean;
    last_validated_at: string | null;
  };
  documents: Array<{
    type: string;
    type_label: string;
    status: string;
    badge: ComplianceBadge;
    expires_at: string | null;
    verified_at: string | null;
    failure_reason: string | null;
    days_until_expiry: number | null;
  }>;
  activity: {
    total: number;
    paid: number;
    rejected: number;
    in_progress: number;
    in_validation: number;
  };
  generated_at: string;
}

@Injectable({ providedIn: 'root' })
export class AdminContractorComplianceService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfiguration);

  summary(phone: string): Observable<{ data: ComplianceSummary }> {
    return adminContractorsComplianceSummary(this.http, this.apiConfig.rootUrl, { phone }).pipe(
      unwrapData<ComplianceSummary>(),
      map(data => ({ data })),
    );
  }
}
