import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Service d'accÃ¨s au snapshot compliance d'un contractor (admin only).
 *
 * Pourquoi : alimente le composant `ContractorComplianceSummaryComponent` qui
 * sert Ã  donner Ã  l'admin tout le contexte nÃ©cessaire AVANT de prendre une
 * dÃ©cision financiÃ¨re (approuver une facture libre, retry un achat, marquer
 * une facture payÃ©e). Cf. la docblock du composant pour le dÃ©tail mÃ©tier.
 *
 * Endpoint backend :
 *   GET /contractor-compliance/admin/contractors/{phone}/compliance-summary
 *   Header : X-Tuita-Admin-Key (lu depuis sessionStorage Ã  chaque requÃªte)
 *
 * Format de retour : un payload plat, prÃ©-mappÃ© (libellÃ©s FR, badges dÃ©jÃ 
 * calculÃ©s cÃ´tÃ© serveur) â†’ le composant n'a rien Ã  transformer.
 */

/**
 * Code de statut retournÃ© par le backend pour chaque "ligne" affichable
 * (KYC ou Document). Le mapping vers une icÃ´ne Material est gÃ©rÃ© cÃ´tÃ© composant.
 *  - ok       : tout va bien (KYC approuvÃ© / doc verified non expirÃ©)
 *  - pending  : en attente (KYC processing / doc pending review)
 *  - ko       : rejetÃ© dÃ©finitivement (KYC rejected / doc rejected)
 *  - expired  : KYC ou doc qui Ã©tait valide mais a expirÃ© (URSSAF > 6 mois etc.)
 *  - missing  : jamais effectuÃ© / jamais uploadÃ© (cas le plus risquÃ© cÃ´tÃ© BTP)
 *  - unknown  : valeur inattendue cÃ´tÃ© backend, fallback (ne devrait jamais arriver)
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
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/contractor/admin`;

  private get adminHeaders(): HttpHeaders {
    return new HttpHeaders({
      'X-Tuita-Admin-Key': sessionStorage.getItem('tuita_admin_key') ?? '',
    });
  }

  summary(phone: string): Observable<{ data: ComplianceSummary }> {
    return this.http.get<{ data: ComplianceSummary }>(
      `${this.base}/contractors/${encodeURIComponent(phone)}/compliance-summary`,
      { headers: this.adminHeaders, withCredentials: true },
    );
  }
}
