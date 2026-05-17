import {
  Component,
  ChangeDetectionStrategy,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';

import {
  ContractorApiService,
  ContractorMission,
} from '../../services/contractor-api.service';

export interface MissionPickerSelection {
  mission_ref: string;
  amount_ttc: number;
  mission: ContractorMission;
}

/**
 * Selecteur de mission a facturer.
 *
 * Charge les missions terminees + payantes + sans facture active depuis
 * `GET /missions?status=invoiceable`, propose un autocomplete recherchable
 * par reference/titre/ville. Une fois selectionnee, expose missionRef +
 * montant TTC verrouilles. Bouton "X" pour changer.
 *
 * Si aucune mission disponible, affiche un message d'etat vide explicite
 * (l'appelant gere le fallback texte libre).
 */
@Component({
  selector: 'app-mission-picker',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatAutocompleteModule,
  ],
  templateUrl: './mission-picker.component.html',
  styleUrl: './mission-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionPickerComponent implements OnInit, OnChanges {
  private readonly api = inject(ContractorApiService);

  /** Mission deja choisie (pour pre-fill : deeplink, re-upload). */
  @Input() initialRef: string | null = null;
  @Input() initialAmount: number | null = null;
  /** Si true, le composant ne charge pas la liste — verrouille en lecture seule. */
  @Input() locked = false;
  /** Cache le bouton "X" meme quand une mission est selectionnee. */
  @Input() allowClear = true;

  @Output() readonly selectionChange = new EventEmitter<MissionPickerSelection | null>();

  readonly availableMissions = signal<ContractorMission[]>([]);
  readonly missionsLoading = signal(false);
  readonly selected = signal<ContractorMission | null>(null);
  readonly lockedRef = signal<string | null>(null);
  readonly lockedAmount = signal<number | null>(null);
  // Signal pour que le computed `filtered` recalcule quand le user tape.
  readonly searchSignal = signal('');

  /** Setter / getter compat ngModel — delegue au signal interne. */
  get search(): string {
    return this.searchSignal();
  }
  set search(value: string) {
    this.searchSignal.set(value ?? '');
  }

  readonly filtered = computed(() => {
    const q = this.searchSignal().toLowerCase().trim();
    const list = this.availableMissions();
    if (!q) return list;
    return list.filter(m =>
      m.caseNumber.toLowerCase().includes(q)
      || (m.missionTitle ?? '').toLowerCase().includes(q)
      || (m.city ?? '').toLowerCase().includes(q),
    );
  });

  ngOnInit(): void {
    if (this.initialRef !== null) {
      this.lockedRef.set(this.initialRef);
      this.lockedAmount.set(this.initialAmount);
      // Pas de chargement si on est arrive avec une mission deja designee.
      return;
    }
    this.loadMissions();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Le parent peut basculer dynamiquement (ex. switch entre upload neuf et
    // re-upload d'une facture rejetee differente). On reflete les nouveaux
    // inputs dans les signals internes, sinon le picker reste fige sur l'etat
    // d'init et l'utilisateur a l'impression que rien ne se passe.
    if ((changes['initialRef'] && !changes['initialRef'].firstChange)
      || (changes['initialAmount'] && !changes['initialAmount'].firstChange)) {
      this.selected.set(null);
      this.searchSignal.set('');
      this.lockedRef.set(this.initialRef);
      this.lockedAmount.set(this.initialAmount);
      if (this.initialRef === null && this.availableMissions().length === 0) {
        this.loadMissions();
      }
    }
  }

  loadMissions(): void {
    this.missionsLoading.set(true);
    this.api.getMissions('invoiceable').subscribe({
      next: res => {
        const billable = (res.data ?? []).filter(m =>
          m.signedAt !== null
          && (m.price ?? 0) > 0
          && (m.invoice_status === 'none' || m.invoice_status === undefined),
        );
        this.availableMissions.set(billable);
        this.missionsLoading.set(false);
      },
      error: () => {
        this.availableMissions.set([]);
        this.missionsLoading.set(false);
      },
    });
  }

  displayMission = (m: ContractorMission | string | null): string => {
    if (!m) return '';
    if (typeof m === 'string') return m;
    return `${m.caseNumber} - ${m.missionTitle}`;
  };

  onSelected(event: MatAutocompleteSelectedEvent): void {
    const mission = event.option.value as ContractorMission;
    this.selected.set(mission);
    this.selectionChange.emit({
      mission_ref: mission.caseNumber,
      amount_ttc: mission.price,
      mission,
    });
  }

  clear(): void {
    this.selected.set(null);
    this.lockedRef.set(null);
    this.lockedAmount.set(null);
    this.searchSignal.set('');
    this.selectionChange.emit(null);
    if (this.availableMissions().length === 0) {
      this.loadMissions();
    }
  }

  formatPrice(p: number | null | undefined): string {
    if (p == null) return '-';
    return p.toFixed(2).replace('.', ',') + ' €';
  }

  /** Vrai si on a une mission a afficher (selectionnee ou pre-fill). */
  isLocked(): boolean {
    return this.locked || this.selected() !== null || this.lockedRef() !== null;
  }

  displayedRef(): string {
    return this.selected()?.caseNumber ?? this.lockedRef() ?? '';
  }

  displayedAmount(): string {
    const amount = this.selected()?.price ?? this.lockedAmount();
    return amount != null ? amount.toFixed(2) : '';
  }
}
