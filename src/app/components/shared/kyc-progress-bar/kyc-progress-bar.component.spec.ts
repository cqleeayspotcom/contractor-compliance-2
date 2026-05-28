import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import {
  KycFlowState,
  KycProgressBarComponent,
} from './kyc-progress-bar.component';

describe('KycProgressBarComponent', () => {
  let fixture: ComponentFixture<KycProgressBarComponent>;
  let cmp: KycProgressBarComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [KycProgressBarComponent],
      providers: [provideNoopAnimations()],
    });
    fixture = TestBed.createComponent(KycProgressBarComponent);
    cmp = fixture.componentInstance;
  });

  function setState(s: KycFlowState): void {
    fixture.componentRef.setInput('state', s);
    fixture.detectChanges();
  }

  describe('visibilité par état', () => {
    it('est cachée sur idle / verified_recap / approved / rejected (écrans dédiés)', () => {
      for (const s of ['idle', 'verified_recap', 'approved', 'rejected'] as const) {
        setState(s);
        expect(cmp.visible()).toBe(false);
        const root = fixture.nativeElement.querySelector('.kyc-progress');
        expect(root).toBeNull();
      }
    });

    it('est visible sur tous les états in-flow (qr_code → polling_stalled)', () => {
      const inFlow: KycFlowState[] = [
        'qr_code', 'challenge_ready', 'countdown', 'recording',
        'uploading', 'processing', 'polling_stalled',
      ];
      for (const s of inFlow) {
        setState(s);
        expect(cmp.visible()).toBe(true);
      }
    });
  });

  describe('mapping état → phase (3 phases visibles)', () => {
    it('phase 1 (Filme-toi) : qr_code, challenge_ready, countdown, recording', () => {
      for (const s of ['qr_code', 'challenge_ready', 'countdown', 'recording'] as const) {
        setState(s);
        expect(cmp.currentPhase()).toBe(0);
      }
    });

    it('phase 2 (Envoi) : uploading uniquement', () => {
      setState('uploading');
      expect(cmp.currentPhase()).toBe(1);
    });

    it('phase 3 (Vérification) : processing + polling_stalled', () => {
      for (const s of ['processing', 'polling_stalled'] as const) {
        setState(s);
        expect(cmp.currentPhase()).toBe(2);
      }
    });
  });

  describe('statut past / active / future de chaque phase', () => {
    it('phase 1 active → phases 1=active, 2=future, 3=future', () => {
      setState('qr_code');
      expect(cmp.phases().map((p) => p.status)).toEqual(['active', 'future', 'future']);
    });

    it('phase 2 active → phases 1=past, 2=active, 3=future', () => {
      setState('uploading');
      expect(cmp.phases().map((p) => p.status)).toEqual(['past', 'active', 'future']);
    });

    it('phase 3 active → phases 1=past, 2=past, 3=active', () => {
      setState('processing');
      expect(cmp.phases().map((p) => p.status)).toEqual(['past', 'past', 'active']);
    });
  });

  describe('libellés et icônes', () => {
    it('expose les 3 phases dans l\'ordre attendu avec icônes Material', () => {
      setState('qr_code');
      const phases = cmp.phases();
      expect(phases).toHaveLength(3);
      expect(phases[0].label).toBe('Filme-toi');
      expect(phases[0].icon).toBe('photo_camera');
      expect(phases[1].label).toBe('Envoi');
      expect(phases[1].icon).toBe('cloud_upload');
      expect(phases[2].label).toBe('Vérification');
      expect(phases[2].icon).toBe('search');
    });

    it('phase past affiche un check au lieu de l\'icône Material (rendu DOM)', () => {
      setState('uploading');
      const pastDot = fixture.nativeElement.querySelector(
        '.kyc-progress__phase--past .kyc-progress__dot mat-icon',
      );
      expect(pastDot?.textContent?.trim()).toBe('check');
    });
  });

  describe('sous-texte de réassurance', () => {
    it('affiche un message dédié pendant uploading / polling_stalled (pas sur processing : la carte principale parle déjà du délai)', () => {
      setState('uploading');
      expect(cmp.subtext()).toContain('envoie');
      setState('processing');
      // Pas de sous-texte sur processing — la carte « Analyse en cours »
      // affiche déjà l'estimation (≈ 2 min, jusqu'à 10 min).
      expect(cmp.subtext()).toBeNull();
      setState('polling_stalled');
      expect(cmp.subtext()).toContain('Toujours');
    });

    it('aucun sous-texte sur les phases « caméra » (qr_code / challenge_ready / countdown / recording)', () => {
      for (const s of ['qr_code', 'challenge_ready', 'countdown', 'recording'] as const) {
        setState(s);
        expect(cmp.subtext()).toBeNull();
      }
    });
  });

  describe('accessibilité', () => {
    it('expose role=progressbar avec aria-valuemin/max/now corrects sur le DOM', () => {
      setState('uploading');
      const bar = fixture.nativeElement.querySelector('.kyc-progress');
      expect(bar?.getAttribute('role')).toBe('progressbar');
      expect(bar?.getAttribute('aria-valuemin')).toBe('1');
      expect(bar?.getAttribute('aria-valuemax')).toBe('3');
      expect(bar?.getAttribute('aria-valuenow')).toBe('2');
    });

    it('marque la phase active avec aria-current=step', () => {
      setState('processing');
      const current = fixture.nativeElement.querySelector('[aria-current="step"]');
      expect(current).not.toBeNull();
      expect(current?.classList.contains('kyc-progress__phase--active')).toBe(true);
    });
  });
});
