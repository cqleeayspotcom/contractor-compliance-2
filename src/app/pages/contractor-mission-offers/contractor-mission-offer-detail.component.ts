import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { BackButtonComponent } from '../../components/shared/back-button/back-button.component';
import { ConfirmationDialogComponent } from '../../components/shared/confirmation-dialog.component';
import { ContractorApiService, MissionOffer } from '../../services/contractor-api.service';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'ready'; offer: MissionOffer; canAccept: boolean }
  | { kind: 'error'; message: string };

@Component({
  selector: 'app-contractor-mission-offer-detail',
  standalone: true,
  imports: [
    CommonModule, RouterLink, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, FormsModule, BackButtonComponent,
  ],
  templateUrl: './contractor-mission-offer-detail.component.html',
  styleUrl: './contractor-mission-offer-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorMissionOfferDetailComponent implements OnInit {
  private api = inject(ContractorApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  state = signal<ViewState>({ kind: 'loading' });
  busy = signal(false);
  declineReason = signal('');

  offer = computed(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.offer : null;
  });

  canAccept = computed(() => {
    const s = this.state();
    return s.kind === 'ready' ? s.canAccept : false;
  });

  showVerificationAlert = computed(() => {
    const s = this.state();
    return s.kind === 'ready' && !s.canAccept;
  });

  errorMessage = computed(() => {
    const s = this.state();
    return s.kind === 'error' ? s.message : '';
  });

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const ref = params.get('mid') ?? params.get('ref');
      if (ref) this.load(ref);
    });
  }

  private load(ref: string): void {
    this.state.set({ kind: 'loading' });
    this.api.getMissionOffer(ref).subscribe({
      next: (res) => this.state.set({
        kind: 'ready',
        offer: res.data,
        canAccept: res.can_accept ?? true,
      }),
      error: (err) => {
        const message = err.status === 404
          ? "Cette offre n'existe plus."
          : "Impossible de charger l'offre.";
        this.state.set({ kind: 'error', message });
      },
    });
  }

  openAcceptConfirm(): void {
    if (!this.canAccept()) {
      this.snack.open(
        "Termine d'abord ta vérification pour accepter une offre.",
        'OK',
        { duration: 5000, panelClass: ['tuita-snackbar'] },
      );
      this.router.navigateByUrl('/documents/upload');
      return;
    }
    ConfirmationDialogComponent.open(this.dialog, {
      title: "Confirmer l'acceptation",
      message: "Tu t'engages à réaliser cette mission. Continuer ?",
      confirmText: "J'accepte",
      cancelText: 'Annuler',
      type: 'info',
    }).subscribe((ok) => {
      if (ok) this.confirmAccept();
    });
  }

  confirmAccept(): void {
    const offer = this.offer();
    if (!offer || this.busy()) return;
    this.busy.set(true);

    this.api.acceptMissionOffer(offer.mission_ref).subscribe({
      next: () => {
        this.snack.open('Mission acceptée ✓ Elle apparaîtra dans tes interventions sous peu.', 'OK', { duration: 5000, panelClass: ['tuita-snackbar', 'snack-success'] });
        this.router.navigateByUrl('/interventions');
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err.status === 409
          ? "Cette offre vient d'être prise par quelqu'un d'autre."
          : "Impossible d'accepter l'offre. Réessaie.";
        this.snack.open(msg, 'OK', { duration: 5000, panelClass: ['tuita-snackbar'] });
      },
    });
  }

  confirmDecline(): void {
    const offer = this.offer();
    if (!offer || this.busy()) return;
    this.busy.set(true);

    this.api.declineMissionOffer(offer.mission_ref, this.declineReason() || undefined).subscribe({
      next: () => {
        this.snack.open('Offre déclinée.', 'OK', { duration: 3000, panelClass: ['tuita-snackbar'] });
        this.router.navigateByUrl('/missions');
      },
      error: () => {
        this.busy.set(false);
        this.snack.open('Impossible de décliner. Réessaie.', 'OK', { duration: 5000, panelClass: ['tuita-snackbar'] });
      },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
  }
}
