import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { UrgencyDialogComponent, UrgencyDialogData } from './urgency-dialog.component';

const STORAGE_KEY = 'tuita.urgency-dialog.last-shown-at';
const SIGNUP_AT_KEY = 'tuita.signup-completed-at';

/**
 * On ré-affiche le dialog au maximum toutes les 30 minutes pour ne pas
 * harceler l'artisan qui rafraîchit beaucoup la page (typique sur chantier
 * avec connexion qui coupe). Assez fréquent pour rappeler, pas au point de
 * pourrir l'expérience.
 */
const COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Période de grâce post-signup pendant laquelle on n'affiche JAMAIS le
 * dialog d'urgence. Un artisan qui vient de créer son compte ne doit pas
 * être harcelé immédiatement avec "Ton dossier n'est pas complet" — il
 * vient à peine d'arriver, c'est mathématique. On lui laisse 24h pour
 * découvrir l'app à son rythme. Au-delà, le dialog reprend son rôle de
 * rappel actif. La clé `SIGNUP_AT_KEY` est posée par le service signup
 * (ContractorSignupService.signup → 201 Created) au moment de la création
 * du compte. En absence de la clé (compte ancien, autre device, navigation
 * privée vidée), pas de grâce — comportement legacy (affichage immédiat).
 */
const POST_SIGNUP_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Pilotage du `UrgencyDialogComponent` — décide quand afficher le rappel
 * "ton dossier n'est pas complet" en fonction de la dernière fois où il a
 * été montré (stocké dans localStorage).
 */
@Injectable({ providedIn: 'root' })
export class UrgencyDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Affiche le dialog si :
   *   - une action est attendue (`nextAction !== 'none'`)
   *   - le dialog n'a pas été montré dans les 30 dernières minutes
   *   - le compte n'est pas dans sa fenêtre de grâce post-signup (24h)
   *
   * Retourne true si le dialog a effectivement été ouvert.
   */
  showIfNeeded(nextAction: string | null | undefined, firstName: string): boolean {
    if (!nextAction || nextAction === 'none') return false;
    if (this.isInSignupGracePeriod()) return false;
    if (!this.cooldownPassed()) return false;
    if ((this.dialog.openDialogs?.length ?? 0) > 0) return false;

    this.dialog.open<UrgencyDialogComponent, UrgencyDialogData>(
      UrgencyDialogComponent,
      {
        data: { nextAction, firstName },
        width: '480px',
        maxWidth: '94vw',
        autoFocus: true,
        restoreFocus: true,
        disableClose: true,
        panelClass: 'urgency-dialog-panel',
      },
    );
    this.markShown();
    return true;
  }

  /**
   * Marque le timestamp de fin de signup. À appeler depuis le service
   * signup juste après réception du 201 Created. Sans appel à cette
   * méthode, la grâce post-signup n'est jamais déclenchée (comportement
   * legacy compatible avec les comptes pré-existants).
   */
  markSignupCompleted(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(SIGNUP_AT_KEY, String(Date.now()));
  }

  private cooldownPassed(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return true;
    const last = window.localStorage.getItem(STORAGE_KEY);
    if (!last) return true;
    const lastMs = Number(last);
    if (!Number.isFinite(lastMs)) return true;
    return Date.now() - lastMs >= COOLDOWN_MS;
  }

  private isInSignupGracePeriod(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const signupAt = window.localStorage.getItem(SIGNUP_AT_KEY);
    if (!signupAt) return false;
    const signupMs = Number(signupAt);
    if (!Number.isFinite(signupMs)) return false;
    return Date.now() - signupMs < POST_SIGNUP_GRACE_MS;
  }

  private markShown(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  }

  /** Pour les tests / scénario reset. */
  resetCooldown(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(STORAGE_KEY);
  }

  /** Pour les tests — force fin de la fenêtre de grâce post-signup. */
  resetSignupGrace(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(SIGNUP_AT_KEY);
  }
}
