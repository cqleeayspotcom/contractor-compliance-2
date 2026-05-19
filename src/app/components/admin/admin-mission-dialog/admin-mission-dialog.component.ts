import { ChangeDetectionStrategy, Component, EventEmitter, Inject, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Api } from '../../../api/api';
import { adminMissionShow } from '../../../api/fn/admin/admin-mission-show';

// POURQUOI : types métier déplacés depuis l'ancien AdminMissionService (supprimé,
// wrapper trivial). Ce composant est l'unique consommateur — on garde les types
// en local plutôt que de créer un fichier `.types.ts` séparé.
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
import { AdminDialogShellComponent } from '../admin-dialog-shell/admin-dialog-shell.component';
import { KpiTileComponent } from '../kpi-tile/kpi-tile.component';
import { AnomalyChipComponent } from '../anomaly-chip/anomaly-chip.component';
import { ContractorMiniCardComponent } from '../contractor-mini-card/contractor-mini-card.component';
import { InvoiceStatusChipComponent } from '../invoice-status-chip/invoice-status-chip.component';
import { ValidatorChipsComponent } from '../validator-chips/validator-chips.component';
import { WebhookStatusDotsComponent } from '../webhook-status-dots/webhook-status-dots.component';
import { DeviationBadgeComponent } from '../deviation-badge/deviation-badge.component';

export interface AdminMissionDialogData { missionRef: string; }

@Component({
  selector: 'app-admin-mission-dialog',
  standalone: true,
  imports: [
    CommonModule, MatIconModule, MatButtonModule, MatTooltipModule,
    AdminDialogShellComponent, KpiTileComponent, AnomalyChipComponent,
    ContractorMiniCardComponent, InvoiceStatusChipComponent,
    ValidatorChipsComponent, WebhookStatusDotsComponent, DeviationBadgeComponent,
  ],
  templateUrl: './admin-mission-dialog.component.html',
  styleUrl: './admin-mission-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMissionDialogComponent implements OnInit {
  // POURQUOI api.invoke direct : un seul endpoint, payload `{ data: MissionDetail }`,
  // pas de transformation — l'ancien AdminMissionService (un wrapper trivial)
  // est supprimé.
  private readonly api = inject(Api);
  private router = inject(Router);
  private ref = inject(MatDialogRef<AdminMissionDialogComponent>);

  loading = signal(true);
  error = signal<string | null>(null);
  detail = signal<MissionDetail | null>(null);

  @Output() openInvoice = new EventEmitter<string>();

  constructor(@Inject(MAT_DIALOG_DATA) public data: AdminMissionDialogData) {}

  ngOnInit(): void {
    this.api
      .invoke(adminMissionShow, { missionRef: this.data.missionRef })
      .then((env) => {
        const data = (env as { data: MissionDetail }).data;
        this.detail.set(data);
        this.loading.set(false);
      })
      .catch((e) => {
        const code = e?.error?.error?.code;
        this.error.set(code === 'mission.unknown' ? 'Mission inconnue ou cancelled' : 'Erreur de chargement');
        this.loading.set(false);
      });
  }

  onInvoiceClick(uuid: string): void { this.openInvoice.emit(uuid); }

  onContractorClick(uuid: string): void {
    this.router.navigate(['/admin/contractors', uuid]);
    this.ref.close();
  }

  close(): void { this.ref.close(); }

  missionStatusLabel(d: MissionDetail | null): string {
    if (!d) return '';
    if (d.snapshot === null && d.invoices.length > 0) return 'Cancelled / inconnue';
    if (d.snapshot === null) return 'Inconnue';
    return 'Active';
  }
}
