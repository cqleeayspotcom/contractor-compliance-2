import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { ContractorApiService, ContractorMission, MissionsQuery } from '../../services/contractor-api.service';
import { RefreshService } from '../../services/refresh.service';
import { BackButtonComponent } from '../../components/shared/back-button/back-button.component';
import { SkeletonComponent } from '../../components/shared/skeleton.component';

type InvoiceStatusKey = ContractorMission['invoice_status'];

interface InvoiceBadge {
  label: string;
  tone: 'todo' | 'progress' | 'success' | 'danger' | 'neutral';
  icon: string;
}

interface InvoiceFilterChip {
  id: string;
  label: string;
  /** Valeurs `invoice_status` envoyees au backend. null = pas de filtre. */
  statuses: string[] | null;
}

const INVOICE_FILTERS: InvoiceFilterChip[] = [
  { id: 'all', label: 'Tout', statuses: null },
  { id: 'to_invoice', label: 'À facturer', statuses: ['none'] },
  { id: 'in_validation', label: 'En validation', statuses: ['validating', 'pending_validation'] },
  { id: 'ready', label: 'Bon pour paiement', statuses: ['ready_to_pay', 'paying'] },
  { id: 'paid', label: 'Payée', statuses: ['paid'] },
  { id: 'rejected', label: 'Rejetée', statuses: ['rejected'] },
];

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

@Component({
  selector: 'app-contractor-interventions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    BackButtonComponent,
    SkeletonComponent,
  ],
  templateUrl: './contractor-interventions.component.html',
  styleUrl: './contractor-interventions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorInterventionsComponent implements OnInit {
  private readonly api = inject(ContractorApiService);
  private readonly router = inject(Router);
  private readonly refreshBus = inject(RefreshService);
  private readonly destroyRef = inject(DestroyRef);

  readonly missions = signal<ContractorMission[]>([]);
  readonly isLoading = signal(true);

  // Stats globales (figees, viennent du backend pour le sous-titre).
  readonly realizedCount = signal(0);
  readonly realizedToInvoice = signal(0);
  readonly statusCounts = signal<Record<string, number>>({});

  // Etat filtre + pagination.
  readonly searchInput = signal('');
  readonly activeFilterId = signal<string>('all');
  readonly currentPage = signal(1);
  readonly filteredTotal = signal(0);
  readonly lastPage = signal(1);

  readonly filters = INVOICE_FILTERS;
  readonly pageSize = PAGE_SIZE;

  readonly hasPrev = computed(() => this.currentPage() > 1);
  readonly hasNext = computed(() => this.currentPage() < this.lastPage());
  readonly hasActiveFilters = computed(
    () => this.searchInput().trim() !== '' || this.activeFilterId() !== 'all',
  );

  private readonly searchInput$ = new Subject<string>();

  ngOnInit(): void {
    this.searchInput$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.currentPage.set(1);
        this.loadMissions();
      });

    this.loadMissions();

    this.refreshBus.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadMissions());
  }

  loadMissions(): void {
    this.isLoading.set(true);

    const filter = this.filters.find(f => f.id === this.activeFilterId()) ?? this.filters[0];
    const query: MissionsQuery = {
      status: 'realized',
      page: this.currentPage(),
      per_page: this.pageSize,
    };

    const search = this.searchInput().trim();
    if (search !== '') query.search = search;
    if (filter.statuses) query.invoice_status = filter.statuses;

    this.api.getMissions(query).subscribe({
      next: res => {
        this.missions.set(res.data);
        this.realizedCount.set(res.meta.realized ?? 0);
        this.realizedToInvoice.set(res.meta.realized_to_invoice ?? 0);
        this.statusCounts.set(res.meta.invoice_status_counts ?? {});
        this.filteredTotal.set(res.meta.filtered_total ?? res.data.length);
        this.lastPage.set(res.meta.last_page ?? 1);
        // Si la page courante a ete vidée par un nouveau filtre, retomber sur la
        // derniere page disponible et recharger.
        if (this.currentPage() > this.lastPage()) {
          this.currentPage.set(this.lastPage());
          this.isLoading.set(false);
          this.loadMissions();

          return;
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.missions.set([]);
        this.isLoading.set(false);
      },
    });
  }

  onSearchChange(value: string): void {
    this.searchInput.set(value);
    this.searchInput$.next(value);
  }

  clearSearch(): void {
    if (this.searchInput() === '') return;
    this.searchInput.set('');
    this.currentPage.set(1);
    this.loadMissions();
  }

  selectFilter(id: string): void {
    if (this.activeFilterId() === id) return;
    this.activeFilterId.set(id);
    this.currentPage.set(1);
    this.loadMissions();
  }

  resetFilters(): void {
    this.searchInput.set('');
    this.activeFilterId.set('all');
    this.currentPage.set(1);
    this.loadMissions();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.lastPage() || page === this.currentPage()) return;
    this.currentPage.set(page);
    this.loadMissions();
  }

  openMission(mission: ContractorMission): void {
    this.router.navigateByUrl(`/interventions/${mission.mid}`);
  }

  joinInvoice(mission: ContractorMission, event: Event): void {
    event.stopPropagation();
    this.router.navigate([`/interventions/${mission.mid}`], { queryParams: { action: 'upload' } });
  }

  needsInvoice(m: ContractorMission): boolean {
    return m.price > 0 && (m.invoice_status === 'none' || m.invoice_status === 'rejected');
  }

  invoiceBadge(status: InvoiceStatusKey): InvoiceBadge {
    switch (status) {
      case 'paid':
        return { label: 'Payée', tone: 'success', icon: 'check_circle' };
      case 'paying':
        return { label: 'Virement en cours', tone: 'progress', icon: 'sync' };
      case 'ready_to_pay':
        return { label: 'Bon pour paiement', tone: 'progress', icon: 'verified' };
      case 'pending_validation':
        return { label: 'En validation Tuita', tone: 'progress', icon: 'hourglass_top' };
      case 'validating':
        return { label: 'Vérification en cours', tone: 'progress', icon: 'hourglass_top' };
      case 'uploaded':
      case 'auto_generated':
        return { label: 'Facture envoyée', tone: 'neutral', icon: 'description' };
      case 'rejected':
        return { label: 'Rejetée - à refaire', tone: 'danger', icon: 'error' };
      case 'none':
      default:
        return { label: 'À facturer', tone: 'todo', icon: 'upload_file' };
    }
  }

  formatPrice(price: number | null | undefined): string {
    if (price == null) return '-';
    return price.toFixed(2).replace('.', ',') + ' €';
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  operationIcon(type: string): string {
    const icons: Record<string, string> = {
      starlink: 'satellite_alt',
      previsit: 'search',
      drone_prev: 'flight',
    };
    return icons[type] ?? 'work';
  }

  trackByMid(_i: number, m: ContractorMission): string {
    return m.mid;
  }

  trackByFilter(_i: number, f: InvoiceFilterChip): string {
    return f.id;
  }

  /** Compteur affiché à droite du label de chaque chip. `null` = pas de badge. */
  filterCount(f: InvoiceFilterChip): number | null {
    const counts = this.statusCounts();
    if (f.statuses === null) return this.realizedCount();
    return f.statuses.reduce((acc, s) => acc + (counts[s] ?? 0), 0);
  }
}
