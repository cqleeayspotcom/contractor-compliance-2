import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ContractorApiService, ContractorDashboard } from './contractor-api.service';

@Injectable({ providedIn: 'root' })
export class ContractorSessionService {
  private readonly api = inject(ContractorApiService);

  // Observable state
  private readonly dashboardSubject = new BehaviorSubject<ContractorDashboard | null>(null);
  readonly dashboard$ = this.dashboardSubject.asObservable();

  readonly isLoading$ = new BehaviorSubject<boolean>(true);
  readonly error$ = new BehaviorSubject<string | null>(null);

  /**
   * Load dashboard data from the backend.
   * Called on app init via APP_INITIALIZER and after key actions (upload, KYC, etc.).
   */
  loadDashboard(): Observable<ContractorDashboard> {
    this.isLoading$.next(true);
    this.error$.next(null);

    return this.api.getDashboard().pipe(
      tap(dashboard => {
        this.dashboardSubject.next(dashboard);
        this.isLoading$.next(false);
        this.error$.next(null);
      }),
      catchError(err => {
        this.isLoading$.next(false);
        // Garde défensive : un appelant abusif (mock ou cancellation) peut
        // pousser dans catchError une valeur non-HttpErrorResponse (ex:
        // undefined). On ne doit jamais crasher sur `err.status`, sous peine
        // de Uncaught TypeError côté APP_INITIALIZER → écran blanc.
        const status = err?.status;
        this.error$.next(
          status === 401 ? 'Session expirée' : 'Erreur de chargement'
        );
        return throwError(() => err);
      })
    );
  }

  /**
   * Fire-and-forget refresh after a user action (document upload, KYC, etc.).
   */
  refreshDashboard(): void {
    this.loadDashboard().subscribe();
  }

  // --- Synchronous getters (snapshot of current state) ---

  get contractor() {
    return this.dashboardSubject.value?.contractor ?? null;
  }

  get complianceScore(): number {
    return this.dashboardSubject.value?.compliance?.score ?? 0;
  }

  get accountState(): string {
    return this.dashboardSubject.value?.account_state ?? 'new';
  }

  get isFullyVerified(): boolean {
    return this.dashboardSubject.value?.account_state === 'fully_verified';
  }

  get plan(): 'free' | 'paid' {
    return this.dashboardSubject.value?.billing?.plan ?? 'free';
  }

  get certificationCompleted(): boolean {
    return this.dashboardSubject.value?.certification?.completed ?? false;
  }

  get kycStatus(): string {
    return this.dashboardSubject.value?.kyc?.status ?? 'not_started';
  }
}
