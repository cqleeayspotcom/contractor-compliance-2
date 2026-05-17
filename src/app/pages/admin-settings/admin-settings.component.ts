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
import { Router, RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  AdminSettingsService,
  PlatformSetting,
  SettingValue,
} from '../../services/admin-settings.service';
import {
  EditSettingDialogComponent,
  EditSettingDialogResult,
} from './edit-setting-dialog.component';
import {
  ResetSettingDialogComponent,
  ResetSettingDialogResult,
} from './reset-setting-dialog.component';
import { AdminBackButtonComponent } from '../../components/admin/admin-back-button/admin-back-button.component';

const ADMIN_KEY_STORAGE_KEY = 'tuita_admin_key';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AdminBackButtonComponent,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './admin-settings.component.html',
  styleUrl: './admin-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettingsComponent implements OnInit {
  private readonly api = inject(AdminSettingsService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly settings = signal<PlatformSetting[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly search = signal<string>('');

  readonly displayedColumns = ['key', 'value', 'source', 'updated_at', 'actions'];

  // Tri client-side appliqué après filtrage par préfixe.
  readonly sortState = signal<Sort>({ active: '', direction: '' });

  readonly filteredSettings = computed(() => {
    const term = this.search().trim().toLowerCase();
    const all = this.settings();
    const filtered = !term ? all : all.filter((s) => s.key.toLowerCase().includes(term));
    const s = this.sortState();
    if (!s.active || !s.direction) return filtered;
    return [...filtered].sort((a, b) => this.compare(a, b, s));
  });

  readonly hasAuth = signal<boolean>(!!sessionStorage.getItem(ADMIN_KEY_STORAGE_KEY));

  ngOnInit(): void {
    if (!this.hasAuth()) {
      this.router.navigate(['/admin']);
      return;
    }
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .list()
      .then((rows) => {
        this.settings.set(rows);
        this.loading.set(false);
      })
      .catch((err) => {
        this.loading.set(false);
        this.handleError(err);
      });
  }

  onSearchChange(value: string): void {
    this.search.set(value);
  }

  openEdit(setting: PlatformSetting): void {
    const ref = this.dialog.open<
      EditSettingDialogComponent,
      PlatformSetting,
      EditSettingDialogResult | undefined
    >(EditSettingDialogComponent, {
      data: setting,
      width: '560px',
      disableClose: true,
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.api
        .update(setting.key, { value: result.value, reason: result.reason })
        .then((updated) => {
          this.snack.open(`Paramètre « ${setting.key} » mis à jour`, 'Fermer', {
            duration: 4000,
          });
          this.replaceRow(updated);
        })
        .catch((err) => this.handleError(err));
    });
  }

  openReset(setting: PlatformSetting): void {
    const ref = this.dialog.open<
      ResetSettingDialogComponent,
      PlatformSetting,
      ResetSettingDialogResult | undefined
    >(ResetSettingDialogComponent, {
      data: setting,
      width: '480px',
      disableClose: true,
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.api
        .reset(setting.key, result.reason)
        .then((updated) => {
          this.snack.open(`Paramètre « ${setting.key} » réinitialisé`, 'Fermer', {
            duration: 4000,
          });
          this.replaceRow(updated);
        })
        .catch((err) => this.handleError(err));
    });
  }

  private replaceRow(updated: PlatformSetting): void {
    const next = this.settings().map((s) => (s.key === updated.key ? updated : s));
    // If the key wasn't there for some reason (rare), append.
    if (!next.some((s) => s.key === updated.key)) {
      next.push(updated);
    }
    this.settings.set(next);
  }

  private handleError(err: unknown): void {
    const httpErr = err as { status?: number; error?: { message?: string } };
    if (httpErr.status === 401 || httpErr.status === 403) {
      this.error.set("Clé d'administration invalide.");
      sessionStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
      this.snack.open("Authentification expirée. Reconnectez-vous.", 'Fermer', {
        duration: 4000,
      });
      this.router.navigate(['/admin']);
      return;
    }
    const msg = httpErr.error?.message ?? 'Erreur serveur. Réessayez.';
    this.error.set(msg);
    this.snack.open(msg, 'Fermer', { duration: 4000 });
  }

  formatValue(value: SettingValue): string {
    if (value === null || value === undefined) return '—';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? 'Activé' : 'Désactivé';
    return String(value);
  }

  sourceLabel(source: PlatformSetting['source']): string {
    return source === 'database' ? 'BDD' : '.env (fallback)';
  }

  sourceColor(source: PlatformSetting['source']): string {
    return source === 'database' ? '#04A777' : '#699CBE';
  }

  trackByKey(_index: number, item: PlatformSetting): string {
    return item.key;
  }

  onSortChange(sort: Sort): void {
    this.sortState.set(sort);
  }

  // Helper de comparaison générique pour le tri client-side.
  private compare(a: PlatformSetting, b: PlatformSetting, sort: Sort): number {
    const valA = this.extractSortValue(a, sort.active);
    const valB = this.extractSortValue(b, sort.active);
    let cmp = 0;
    if (valA == null && valB == null) cmp = 0;
    else if (valA == null) cmp = -1;
    else if (valB == null) cmp = 1;
    else if (typeof valA === 'number' && typeof valB === 'number') cmp = valA - valB;
    else if (typeof valA === 'string' && typeof valB === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valA)) cmp = Date.parse(valA) - Date.parse(valB);
    else cmp = String(valA).localeCompare(String(valB), 'fr');
    return sort.direction === 'desc' ? -cmp : cmp;
  }

  private extractSortValue(row: PlatformSetting, key: string): unknown {
    switch (key) {
      case 'key': return row.key;
      case 'value': return this.formatValue(row.value);
      case 'source': return row.source;
      case 'updated_at': return row.updated_at;
      default: return (row as unknown as Record<string, unknown>)[key];
    }
  }
}
