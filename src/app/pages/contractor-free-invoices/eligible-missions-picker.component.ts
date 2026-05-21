import { ChangeDetectionStrategy, Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { EligibleMission, FreeInvoiceService } from '../../services/free-invoice.service';
import { SkeletonComponent } from '../../components/shared/skeleton.component';

@Component({
  selector: 'app-eligible-missions-picker',
  standalone: true,
  imports: [CommonModule, MatListModule, MatCheckboxModule, MatIconModule, SkeletonComponent],
  templateUrl: './eligible-missions-picker.component.html',
  styleUrl: './eligible-missions-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EligibleMissionsPickerComponent implements OnInit {
  private readonly svc = inject(FreeInvoiceService);

  readonly missions = signal<EligibleMission[]>([]);
  readonly loading = signal(true);
  readonly selectedRefs = signal<Set<string>>(new Set());

  readonly selectedCount = computed(() => this.selectedRefs().size);
  readonly maxReached = computed(() => this.selectedCount() >= 3);

  readonly selectionChange = output<string[]>();

  ngOnInit(): void {
    this.svc.getEligibleMissions().subscribe({
      next: (m) => {
        this.missions.set(m);
        this.loading.set(false);
      },
      error: () => {
        this.missions.set([]);
        this.loading.set(false);
      },
    });
  }

  toggle(ref: string, checked: boolean): void {
    const next = new Set(this.selectedRefs());
    if (checked) {
      if (next.size >= 3) return;
      next.add(ref);
    } else {
      next.delete(ref);
    }
    this.selectedRefs.set(next);
    this.selectionChange.emit(Array.from(next));
  }

  isSelected(ref: string): boolean {
    return this.selectedRefs().has(ref);
  }

  isDisabled(ref: string): boolean {
    return !this.isSelected(ref) && this.maxReached();
  }

  formatAmount(amount: string | null): string {
    if (!amount) return '-';
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(amount));
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR');
  }
}
