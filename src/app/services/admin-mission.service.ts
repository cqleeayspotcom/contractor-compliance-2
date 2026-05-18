import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiConfiguration } from '../api/api-configuration';
import { adminMissionShow } from '../api/fn/admin/admin-mission-show';

export type ValidatorType = 'compliance' | 'production' | 'accounting';
export type ValidationStatus = 'approved' | 'rejected' | null;

export interface MissionInvoice {
  uuid: string;
  number: string | null;
  status: string;
  amount_ttc: number;
  deviation_pct: number | null;
  validations: Record<ValidatorType, ValidationStatus>;
  webhooks: { rejected: boolean; ready_to_pay: boolean; payment_in_progress: boolean; paid: boolean };
  created_at: string | null;
}

export interface MissionContractor {
  uuid: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company_name: string | null;
  siren: string | null;
  plan: string;
  account_state: string | null;
  kyc_status: string | null;
  compliance_score: number;
  documents_verified: number;
  documents_required: number;
  has_iban: boolean;
}

export interface MissionAnomaly {
  level: 'warning' | 'critical';
  code: string;
  label: string;
}

export interface MissionDetail {
  mission_ref: string;
  snapshot: {
    mission_title: string | null;
    operation_type: string | null;
    city: string | null;
    expected_amount_ttc: number;
    completed_at: string | null;
  } | null;
  contractor: MissionContractor | null;
  kpis: {
    expected_ttc: number;
    total_invoiced_ttc: number;
    deviation_pct: number | null;
    reopens_count: number;
    age_days: number | null;
  };
  anomalies: MissionAnomaly[];
  invoices: MissionInvoice[];
}

@Injectable({ providedIn: 'root' })
export class AdminMissionService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfiguration);

  // SDK first : adminMissionShow encapsule l'appel REST. Le header
  // X-Tuita-Admin-Key est injecté globalement par admin-key.interceptor.ts.
  getMissionDetail(missionRef: string): Observable<MissionDetail> {
    return adminMissionShow(this.http, this.apiConfig.rootUrl, { missionRef }).pipe(
      map(r => r.body as unknown as MissionDetail),
    );
  }
}
