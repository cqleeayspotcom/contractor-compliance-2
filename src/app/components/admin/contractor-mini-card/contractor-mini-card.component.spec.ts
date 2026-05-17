import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { ContractorMiniCardComponent } from './contractor-mini-card.component';

describe('ContractorMiniCardComponent', () => {
  it('renders contractor name + iban check', () => {
    TestBed.configureTestingModule({ providers: [provideAnimations()] });
    const f = TestBed.createComponent(ContractorMiniCardComponent);
    f.componentRef.setInput('contractor', {
      uuid: 'c1', first_name: 'Marc', last_name: 'Dupont',
      phone: 'P33...', company_name: 'ACME', siren: '123', plan: 'free',
      account_state: 'fully_verified', kyc_status: 'approved',
      compliance_score: 100, documents_verified: 6, documents_required: 6, has_iban: true,
    });
    f.detectChanges();
    const html = f.nativeElement.outerHTML;
    expect(html).toContain('Marc Dupont');
    expect(html).toContain('IBAN ✓');
  });

  it('emits openProfile on button click', () => {
    TestBed.configureTestingModule({ providers: [provideAnimations()] });
    const f = TestBed.createComponent(ContractorMiniCardComponent);
    f.componentRef.setInput('contractor', {
      uuid: 'c1', first_name: 'A', last_name: 'B', phone: null, company_name: null,
      siren: null, plan: 'free', account_state: null, kyc_status: 'rejected',
      compliance_score: 0, documents_verified: 0, documents_required: 6, has_iban: false,
    });
    let captured: string | null = null;
    f.componentInstance.openProfile.subscribe((u: string) => (captured = u));
    f.detectChanges();
    f.nativeElement.querySelector('button.cmc__cta').click();
    expect(captured).toBe('c1');
  });
});
