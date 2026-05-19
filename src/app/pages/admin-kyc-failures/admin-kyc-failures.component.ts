import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  AdminKycService,
  KycSessionRow,
} from '../../services/admin-kyc.service';
import { AdminKycSessionDialogComponent } from './admin-kyc-session-dialog.component';
import { AdminBackButtonComponent } from '../../components/admin/admin-back-button/admin-back-button.component';
import { PhoneDisplayPipe } from '../../pipes/phone-display.pipe';

interface FailureReasonOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-admin-kyc-failures',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AdminBackButtonComponent,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatCardModule,
    PhoneDisplayPipe,
  ],
  templateUrl: './admin-kyc-failures.component.html',
  styleUrl: './admin-kyc-failures.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminKycFailuresComponent implements OnInit {
  private readonly api = inject(AdminKycService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly failureReasonOptions: FailureReasonOption[] = [
    { value: 'all', label: 'Tous' },
    { value: 'liveness_failed', label: 'Liveness échouée (anti-spoofing)' },
    { value: 'face_not_detected', label: 'Aucun visage détecté' },
    { value: 'face_mismatch', label: 'Le visage ne correspond pas au document' },
    { value: 'face_mismatch_on_doc_change', label: 'Mismatch après reupload doc identité' },
    { value: 'dual_challenge_failed', label: 'Échec sur les 2 challenges 3D' },
    { value: 'spoofing_detected', label: 'Spoofing détecté' },
    { value: 'biometric_service_unavailable', label: 'Service biométrique indisponible' },
    { value: 'provider_unavailable_on_rematch', label: 'Provider KO pendant re-match' },
    { value: 'best_frame_missing', label: 'Frame de référence manquante (KYC ancien)' },
  ];

  readonly displayedColumns = [
    'uuid',
    'contractor',
    'failure_reason',
    'liveness_score',
    'face_match_score',
    'provider',
    'date',
    'actions',
  ];

  readonly rows = signal<KycSessionRow[]>([]);
  // Tri server-side : envoie `sort` + `direction` au backend (whitelist alignée
  // avec AdminSupervisionController::applyKycSort). Couvre toutes les pages.
  readonly sort = signal<string>('created_at');
  readonly direction = signal<'asc' | 'desc'>('desc');
  readonly isLoading = signal(false);
  readonly errorMsg = signal<string | null>(null);

  readonly failureReasonFilter = signal<string>('all');
  readonly phoneFilter = signal<string>('');

  readonly page = signal(0);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  readonly hasResults = computed(() => this.rows().length > 0);

  ngOnInit(): void {
    // Auth garantie par AdminAuthGuard sur /admin/* ; Bearer OAuth2 injecté
    // par admin-key.interceptor.
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMsg.set(null);

    this.api
      .getRejections({
        page: this.page() + 1,
        per_page: this.pageSize(),
        failure_reason: this.failureReasonFilter(),
        phone: this.phoneFilter().trim() || undefined,
        sort: this.sort(),
        direction: this.direction(),
      })
      .then((res) => {
        this.rows.set(res.data ?? []);
        this.total.set(res.meta?.total ?? (res.data?.length ?? 0));
        this.isLoading.set(false);
      })
      .catch((err) => {
        this.isLoading.set(false);
        this.handleError(err);
      });
  }

  onFailureReasonChange(value: string): void {
    this.failureReasonFilter.set(value);
    this.page.set(0);
    this.load();
  }

  onPhoneSearch(): void {
    this.page.set(0);
    this.load();
  }

  onPageChange(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  openDetail(row: KycSessionRow): void {
    this.dialog.open(AdminKycSessionDialogComponent, {
      data: { session: row },
      width: '960px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      panelClass: 'admin-kyc-detail-dialog',
    });
  }

  failureReasonLabel(code: string | null): string {
    if (!code) return '—';
    const found = this.failureReasonOptions.find((o) => o.value === code);
    return found ? found.label : code;
  }

  contractorName(row: KycSessionRow): string {
    const parts = [row.contractor_first_name, row.contractor_last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '—';
  }

  formatScore(score: number | null): string {
    if (score === null || score === undefined) return '—';
    return score.toFixed(2);
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackByUuid(_index: number, row: KycSessionRow): string {
    return row.uuid;
  }

  onSortChange(s: Sort): void {
    // 'contractor' n'est pas triable côté backend (champ joint) → ignoré
    // (colonne sans mat-sort-header dans le HTML).
    if (!s.active || !s.direction) {
      this.sort.set('created_at');
      this.direction.set('desc');
    } else {
      this.sort.set(s.active);
      this.direction.set(s.direction);
    }
    this.page.set(0);
    this.load();
  }

  private handleError(err: unknown): void {
    const httpErr = err as { status?: number };
    if (httpErr?.status === 401 || httpErr?.status === 403) {
      this.snackBar.open('Session admin expirée — reconnectez-vous.', 'Fermer', { duration: 4000 });
      sessionStorage.removeItem('tuita_admin_token');
      sessionStorage.removeItem('tuita_admin_refresh');
      sessionStorage.removeItem('tuita_admin_user');
      this.router.navigate(['/admin/login']);
      return;
    }
    this.errorMsg.set('Erreur lors du chargement des échecs KYC.');
    console.error('[admin-kyc-failures]', err);
  }
}
