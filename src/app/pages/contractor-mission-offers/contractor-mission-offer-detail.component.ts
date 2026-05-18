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
    // Le backend Tuita n'expose pas le détail d'une offre individuelle —
    // on lit donc la liste complète des offres et on filtre côté client.
    // Acceptation/refus restent indisponibles (workflow backoffice ops).
    this.state.set({ kind: 'loading' });
    this.api.listMissionOffers().subscribe({
      next: (res) => {
        const offer = (res.data ?? []).find((o) => o.mission_ref === ref);
        if (!offer) {
          this.state.set({ kind: 'error', message: "Cette offre n'existe plus." });
          return;
        }
        this.state.set({
          kind: 'ready',
          offer,
          // Acceptation par cet écran indisponible côté Tuita (workflow ops).
          canAccept: false,
        });
      },
      error: () => this.state.set({ kind: 'error', message: "Impossible de charger l'offre." }),
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
    // Acceptation indisponible côté Tuita (workflow backoffice ops).
    // On informe le contractor que l'acceptation se fait via le manager FOM.
    this.snack.open(
      "L'acceptation d'offre passe par ton manager terrain — contacte-le directement.",
      'OK',
      { duration: 6000, panelClass: ['tuita-snackbar'] },
    );
  }

  confirmDecline(): void {
    // Pas de route decline côté Tuita non plus — mêmes raisons.
    this.snack.open(
      "Pour décliner, contacte ton manager terrain.",
      'OK',
      { duration: 6000, panelClass: ['tuita-snackbar'] },
    );
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
  }
}
