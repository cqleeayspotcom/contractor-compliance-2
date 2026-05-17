import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { OnboardingBannerComponent } from './onboarding-banner.component';

function createFixture(nextAction: string | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OnboardingBannerComponent],
    providers: [provideRouter([])],
  });

  const fixture = TestBed.createComponent(OnboardingBannerComponent);
  fixture.componentRef.setInput('nextAction', nextAction);
  fixture.componentRef.setInput('firstName', 'Lucian');
  fixture.detectChanges();
  return fixture;
}

describe('OnboardingBannerComponent', () => {
  it('renders nothing when next_action is null or "none"', () => {
    expect(createFixture(null).componentInstance.step()).toBeNull();
    expect(createFixture('none').componentInstance.step()).toBeNull();
  });

  it('returns null for unknown actions (forward-compat)', () => {
    expect(createFixture('mystery_future_action').componentInstance.step()).toBeNull();
  });

  it('maps upload_missing_documents to step 1/3 routed to the upload stepper', () => {
    const cmp = createFixture('upload_missing_documents').componentInstance;
    const step = cmp.step()!;
    expect(step.index).toBe(1);
    expect(step.total).toBe(3);
    // Bouton "Commencer" du bandeau pointe vers le stepper guidé, pas la
    // page /documents (qui reste la vue de gestion permanente post-onboarding).
    expect(step.route).toBe('/documents/upload');
    expect(step.icon).toBe('folder_shared');
    // Vidéo d'onboarding configurée — l'artisan doit voir le guide visuel.
    expect(step.video).toBeTruthy();
  });

  it('maps start_kyc to step 2/3 routed to /kyc', () => {
    const step = createFixture('start_kyc').componentInstance.step()!;
    expect(step.index).toBe(2);
    expect(step.total).toBe(3);
    expect(step.route).toBe('/kyc');
  });

  it('maps complete_certification to step 3/3 routed to /certification', () => {
    const step = createFixture('complete_certification').componentInstance.step()!;
    expect(step.index).toBe(3);
    expect(step.total).toBe(3);
    expect(step.route).toBe('/certification');
  });

  it('does not show a banner step for subscribe_paid_plan (handled elsewhere)', () => {
    expect(createFixture('subscribe_paid_plan').componentInstance.step()).toBeNull();
  });
});
