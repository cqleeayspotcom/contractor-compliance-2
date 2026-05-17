import { TestBed } from '@angular/core/testing';
import { NextOnboardingStepService } from './next-onboarding-step.service';

describe('NextOnboardingStepService', () => {
  let service: NextOnboardingStepService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NextOnboardingStepService);
  });

  it('returns null for null/undefined/none', () => {
    expect(service.resolve(null)).toBeNull();
    expect(service.resolve(undefined)).toBeNull();
    expect(service.resolve('none')).toBeNull();
  });

  it('returns null for unknown forward-compat actions', () => {
    expect(service.resolve('future_unknown_action')).toBeNull();
  });

  it('returns null for subscribe_paid_plan (handled elsewhere)', () => {
    expect(service.resolve('subscribe_paid_plan')).toBeNull();
  });

  it('maps upload_missing_documents → /documents/upload, step 1', () => {
    const step = service.resolve('upload_missing_documents');
    expect(step).not.toBeNull();
    expect(step!.route).toBe('/documents/upload');
    expect(step!.index).toBe(1);
    expect(step!.kind).toBe('onboarding');
    expect(step!.icon).toBe('folder_shared');
  });

  it('maps start_kyc → /kyc, step 2 onboarding', () => {
    const step = service.resolve('start_kyc');
    expect(step!.route).toBe('/kyc');
    expect(step!.index).toBe(2);
    expect(step!.kind).toBe('onboarding');
  });

  it('maps retry_kyc → /kyc, step 2 maintenance', () => {
    const step = service.resolve('retry_kyc');
    expect(step!.route).toBe('/kyc');
    expect(step!.kind).toBe('maintenance');
  });

  it('maps complete_certification → /certification, step 3', () => {
    const step = service.resolve('complete_certification');
    expect(step!.route).toBe('/certification');
    expect(step!.index).toBe(3);
    expect(step!.icon).toBe('school');
  });

  it('maps renew_expired_documents → /documents/upload, maintenance', () => {
    const step = service.resolve('renew_expired_documents');
    expect(step!.route).toBe('/documents/upload');
    expect(step!.kind).toBe('maintenance');
  });
});
