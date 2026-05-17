import { Component, ChangeDetectionStrategy, inject, signal, effect, OnInit, OnDestroy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { ContractorApiService } from '../../services/contractor-api.service';
import { PricingService } from '../../services/pricing.service';
import { ContractorSessionService } from '../../services/contractor-session.service';
import { RefreshService } from '../../services/refresh.service';
import { rejectionMessage, DocumentRejectionCopy } from './document-rejection-messages';
import { OnboardingNextStepCtaComponent } from '../../components/shared/onboarding-next-step-cta/onboarding-next-step-cta.component';
import { BackButtonComponent } from '../../components/shared/back-button/back-button.component';

interface DocumentDetail {
  uuid: string;
  type: string;
  status: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  detected_type: string | null;
  detection_confidence: number | null;
  uploaded_at: string | null;
  expires_at: string | null;
  failure_reason: string | null;
  failure_detail: string | null;
  verification_result: any | null;
}

@Component({
  selector: 'app-contractor-document-status',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    OnboardingNextStepCtaComponent,
    BackButtonComponent,
  ],
  templateUrl: './contractor-document-status.component.html',
  styleUrl: './contractor-document-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContractorDocumentStatusComponent implements OnInit, OnDestroy {
  private readonly api = inject(ContractorApiService);
  private readonly session = inject(ContractorSessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly refreshBus = inject(RefreshService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pricing = inject(PricingService);

  readonly document = signal<DocumentDetail | null>(null);
  readonly isLoading = signal(true);
  readonly isDownloading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly nextAction = signal<string | null>(null);

  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  private readonly verifiedNextStepEffect = effect(() => {
    const d = this.document();
    if (d?.status === 'verified' && this.nextAction() === null) {
      this.api.getDashboard()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (dash) => this.nextAction.set(dash.next_action ?? null),
          error: () => this.nextAction.set(null),
        });
    }
  });

  ngOnInit(): void {
    this.loadStatus();
    this.refreshBus.refresh$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshStatus());
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  private loadStatus(): void {
    const uuid = this.route.snapshot.paramMap.get('uuid');
    if (!uuid) {
      this.errorMessage.set('Document introuvable.');
      this.isLoading.set(false);
      return;
    }

    this.api.getDocumentStatus(uuid).subscribe({
      next: (res: any) => {
        const doc: DocumentDetail = res.data ?? res;
        this.document.set(doc);
        this.isLoading.set(false);

        if (doc.status === 'processing' || doc.status === 'pending') {
          this.startPolling(uuid);
        } else if (doc.status === 'verified') {
          this.session.refreshDashboard();
        }
      },
      error: () => {
        this.errorMessage.set('Impossible de charger le document.');
        this.isLoading.set(false);
      },
    });
  }

  private startPolling(uuid: string): void {
    this.stopPolling();
    this.pollingTimer = setInterval(() => {
      this.api.getDocumentStatus(uuid).subscribe({
        next: (res: any) => {
          const doc: DocumentDetail = res.data ?? res;
          this.document.set(doc);

          if (doc.status !== 'processing' && doc.status !== 'pending') {
            this.stopPolling();
            if (doc.status === 'verified') {
              this.session.refreshDashboard();
            }
          }
        },
      });
    }, 3000);
  }

  private stopPolling(): void {
    if (this.pollingTimer !== null) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  goBack(): void {
    this.router.navigateByUrl('/documents');
  }

  goToDashboard(): void {
    this.router.navigateByUrl('/dashboard');
  }

  /** Telecharger le document dechiffre. */
  downloadDocument(): void {
    const doc = this.document();
    if (!doc) return;

    this.isDownloading.set(true);
    this.api.downloadDocument(doc.uuid).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = doc.file_name ?? `${doc.uuid}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.isDownloading.set(false);
      },
      error: () => {
        this.isDownloading.set(false);
      },
    });
  }

  /** Rafraichir manuellement le statut. */
  refreshStatus(): void {
    const uuid = this.route.snapshot.paramMap.get('uuid');
    if (!uuid) return;
    this.api.getDocumentStatus(uuid).subscribe({
      next: (res: any) => {
        const doc: DocumentDetail = res.data ?? res;
        this.document.set(doc);
        if (doc.status === 'verified') {
          this.session.refreshDashboard();
        }
      },
    });
  }

  confidencePercent(): number {
    const doc = this.document();
    return doc?.detection_confidence ? Math.round(doc.detection_confidence * 100) : 0;
  }

  isProcessing(): boolean {
    const status = this.document()?.status;
    return status === 'processing' || status === 'pending';
  }

  /**
   * Retourne le message user-friendly pour un document rejeté, ou null si
   * le code de rejet n'est pas mappé (le template affichera alors
   * `failure_detail` brut en fallback).
   */
  rejectionCopy(): DocumentRejectionCopy | null {
    const doc = this.document();
    return doc ? rejectionMessage(doc.failure_reason, this.pricing.priceLabelFor('extrait_inpi')) : null;
  }

  typeLabel(type: string | null): string {
    if (!type) return 'Document';
    const labels: Record<string, string> = {
      kbis: 'KBIS (société) ou Avis SIRENE / Extrait D1 (auto-entrepreneur)', rc: 'RC Pro', urssaf: 'Attestation URSSAF',
      cni: 'Pièce d\'identité', rib: 'RIB', other: 'Document',
      assurance_decennale: 'Assurance décennale', attestation_fiscale: 'Attestation fiscale',
      attestation_regularite_fiscale: 'Attestation de régularité fiscale',
      attestation_regularite_sociale: 'Attestation de régularité sociale',
      statuts: 'Statuts de la société', avis_sirene: 'Avis SIRENE / Extrait D1',
    };
    return labels[type] ?? type;
  }

  formatFileSize(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
  }
}
