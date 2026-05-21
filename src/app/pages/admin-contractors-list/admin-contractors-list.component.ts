import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subject, debounceTime } from 'rxjs';

import {
  AdminContractorService,
  BrowseQuery,
  ContractorBrowseFacets,
  ContractorListRow,
} from '../../services/admin-contractor.service';
import { AdminContractorComponent } from '../admin-contractor/admin-contractor.component';
import { PhoneDisplayPipe } from '../../pipes/phone-display.pipe';
import { AdminBackButtonComponent } from '../../components/admin/admin-back-button/admin-back-button.component';
import { SkeletonComponent } from '../../components/shared/skeleton.component';

const DEPARTMENTS: string[] = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, '0')),
  '971',
  '972',
  '973',
  '974',
  '976',
];

@Component({
  selector: 'app-admin-contractors-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
    MatDialogModule,
    PhoneDisplayPipe,
    AdminBackButtonComponent,
    SkeletonComponent,
  ],
  templateUrl: './admin-contractors-list.component.html',
  styleUrl: './admin-contractors-list.component.scss',
})
export class AdminContractorsListComponent implements OnInit {
  private readonly api = inject(AdminContractorService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly departments = DEPARTMENTS;

  readonly loading = signal(false);
  readonly rows = signal<ContractorListRow[]>([]);
  readonly total = signal(0);
  readonly facets = signal<ContractorBrowseFacets | null>(null);

  // Filters (signals → URL queryParams sync)
  readonly q = signal('');
  readonly accountState = signal<string>('');
  readonly plan = signal<string>('');
  readonly kycStatus = signal<string>('');
  readonly compliance = signal<string>('');
  readonly city = signal('');
  readonly department = signal<string>('');
  readonly hasActiveInvoice = signal(false);
  readonly hasStuckInvoice = signal(false);
  readonly createdAfter = signal('');
  readonly createdBefore = signal('');
  readonly sort = signal<NonNullable<BrowseQuery['sort']>>('created_at');
  readonly direction = signal<'asc' | 'desc'>('desc');
  readonly page = signal(0);
  readonly pageSize = signal(25);

  private readonly searchInput$ = new Subject<string>();

  readonly displayedColumns = [
    'phone',
    'name',
    'company',
    'siren',
    'city',
    'plan',
    'state',
    'kyc',
    'score',
    'invoices',
    'created',
  ];

  readonly hasFilters = computed(
    () =>
      !!this.q() ||
      !!this.accountState() ||
      !!this.plan() ||
      !!this.kycStatus() ||
      !!this.compliance() ||
      !!this.city() ||
      !!this.department() ||
      this.hasActiveInvoice() ||
      this.hasStuckInvoice() ||
      !!this.createdAfter() ||
      !!this.createdBefore(),
  );

  ngOnInit(): void {
    this.hydrateFromUrl();

    this.searchInput$.pipe(debounceTime(300)).subscribe((value) => {
      this.q.set(value);
      this.page.set(0);
      this.refresh();
    });

    this.refresh();
  }

  private hydrateFromUrl(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.has('q')) this.q.set(qp.get('q') ?? '');
    if (qp.has('account_state')) this.accountState.set(qp.get('account_state') ?? '');
    if (qp.has('plan')) this.plan.set(qp.get('plan') ?? '');
    if (qp.has('kyc_status')) this.kycStatus.set(qp.get('kyc_status') ?? '');
    if (qp.has('compliance')) this.compliance.set(qp.get('compliance') ?? '');
    if (qp.has('city')) this.city.set(qp.get('city') ?? '');
    if (qp.has('department')) this.department.set(qp.get('department') ?? '');
    if (qp.has('has_active_invoice')) this.hasActiveInvoice.set(qp.get('has_active_invoice') === '1');
    if (qp.has('has_stuck_invoice')) this.hasStuckInvoice.set(qp.get('has_stuck_invoice') === '1');
    if (qp.has('sort')) this.sort.set((qp.get('sort') as BrowseQuery['sort']) ?? 'created_at');
    if (qp.has('direction')) this.direction.set((qp.get('direction') as 'asc' | 'desc') ?? 'desc');
    if (qp.has('page')) this.page.set(Number(qp.get('page') ?? '0'));
    if (qp.has('per_page')) this.pageSize.set(Number(qp.get('per_page') ?? '25'));
  }

  private syncUrl(): void {
    const params: Record<string, string | null> = {
      q: this.q() || null,
      account_state: this.accountState() || null,
      plan: this.plan() || null,
      kyc_status: this.kycStatus() || null,
      compliance: this.compliance() || null,
      city: this.city() || null,
      department: this.department() || null,
      has_active_invoice: this.hasActiveInvoice() ? '1' : null,
      has_stuck_invoice: this.hasStuckInvoice() ? '1' : null,
      sort: this.sort() === 'created_at' ? null : this.sort(),
      direction: this.direction() === 'desc' ? null : this.direction(),
      page: this.page() === 0 ? null : String(this.page()),
      per_page: this.pageSize() === 25 ? null : String(this.pageSize()),
    };
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.syncUrl();

    const query: BrowseQuery = {
      page: this.page() + 1,
      per_page: this.pageSize(),
      q: this.q() || undefined,
      account_state: this.accountState() || undefined,
      plan: this.plan() || undefined,
      kyc_status: (this.kycStatus() as BrowseQuery['kyc_status']) || undefined,
      compliance: (this.compliance() as BrowseQuery['compliance']) || undefined,
      city: this.city() || undefined,
      department: this.department() || undefined,
      has_active_invoice: this.hasActiveInvoice() ? 1 : undefined,
      has_stuck_invoice: this.hasStuckInvoice() ? 1 : undefined,
      created_after: this.createdAfter() || undefined,
      created_before: this.createdBefore() || undefined,
      sort: this.sort(),
      direction: this.direction(),
    };

    this.api.list(query).subscribe({
      next: (r) => {
        this.rows.set(r.data);
        this.total.set(r.meta.total);
        this.facets.set(r.facets);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.snack.open('Erreur de chargement : ' + (err?.error?.error?.message ?? err.message), 'OK', {
          duration: 5000,
        });
      },
    });
  }

  onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  onFilterChange(): void {
    this.page.set(0);
    this.refresh();
  }

  onSortChange(s: Sort): void {
    if (!s.active || !s.direction) {
      this.sort.set('created_at');
      this.direction.set('desc');
    } else {
      this.sort.set(s.active as BrowseQuery['sort'] as NonNullable<BrowseQuery['sort']>);
      this.direction.set(s.direction);
    }
    this.refresh();
  }

  onPageChange(e: PageEvent): void {
    this.page.set(e.pageIndex);
    this.pageSize.set(e.pageSize);
    this.refresh();
  }

  resetFilters(): void {
    this.q.set('');
    this.accountState.set('');
    this.plan.set('');
    this.kycStatus.set('');
    this.compliance.set('');
    this.city.set('');
    this.department.set('');
    this.hasActiveInvoice.set(false);
    this.hasStuckInvoice.set(false);
    this.createdAfter.set('');
    this.createdBefore.set('');
    this.page.set(0);
    this.refresh();
  }

  openContractor(row: ContractorListRow): void {
    const ref = this.dialog.open(AdminContractorComponent, {
      data: { phone: row.phone },
      width: '95vw',
      maxWidth: '1400px',
      maxHeight: '95vh',
      panelClass: 'admin-contractor-dialog',
      autoFocus: false,
    });
    // La fiche permet de muter le contractor (KYC, documents, factures…).
    // Sans ce refresh, la ligne de la liste resterait figée sur l'ancien
    // statut / score après fermeture du dialogue. `refresh()` rejoue la
    // requête avec les filtres + page courants.
    ref.afterClosed().subscribe(() => this.refresh());
  }

  // ----- Display helpers -----

  stateLabel(s: string | null): string {
    const map: Record<string, string> = {
      new: 'Nouveau',
      verification_pending: 'En vérif.',
      documents_incomplete: 'Docs incomplets',
      kyc_pending: 'KYC en cours',
      kyc_rejected: 'KYC rejeté',
      certification_pending: 'QCM en attente',
      fully_verified: 'Complet',
    };
    return s ? map[s] ?? s : '—';
  }

  kycLabel(k: string): string {
    const map: Record<string, string> = {
      approved: 'Validé',
      rejected: 'Rejeté',
      pending: 'En cours',
      none: 'Jamais fait',
    };
    return map[k] ?? k;
  }

  kycColor(k: string): 'primary' | 'warn' | 'accent' | undefined {
    if (k === 'approved') return 'primary';
    if (k === 'rejected') return 'warn';
    if (k === 'pending') return 'accent';
    return undefined;
  }

  scoreColor(score: number): string {
    if (score >= 100) return '#16a34a';
    if (score >= 50) return '#eab308';
    return '#dc2626';
  }
}
