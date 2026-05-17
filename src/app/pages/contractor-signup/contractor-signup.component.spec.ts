import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';

import { ContractorSignupComponent } from './contractor-signup.component';
import { ContractorSignupService } from '../../services/contractor-signup.service';

/**
 * Garantit que le champ email est obligatoire à l'inscription (fix 2026-05-14).
 *
 * Avant ce fix le contractor pouvait s'inscrire sans email réel : le backend
 * fallback-ait sur `{phone}@contractor.tuita.fr`, un placeholder bidon qui
 * empêchait toute notification email de partir (virement, doc expiry, rejet
 * facture). Désormais le formulaire bloque le submit tant qu'aucune adresse
 * email valide n'est saisie, ET envoie cet email dans le payload backend.
 */
describe('ContractorSignupComponent — email required', () => {
  let apiSpy: {
    verifyCode: ReturnType<typeof vi.fn>;
    signup: ReturnType<typeof vi.fn>;
  };
  let routerSpy: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    apiSpy = {
      verifyCode: vi.fn().mockReturnValue(of({ success: true, data: { valid: true, code: 'AB23' } })),
      signup: vi.fn().mockReturnValue(of({
        success: true,
        data: {
          session_id: 'sig_xxx',
          contractor: { uuid: 'u', phone: 'P33612345678', first_name: null, last_name: null },
          invitation: { code_used: 'AB23' },
          next: '/dashboard',
        },
      })),
    };
    routerSpy = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      imports: [ContractorSignupComponent],
      providers: [
        { provide: ContractorSignupService, useValue: apiSpy },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  it('exposes a writable email signal initialized empty', () => {
    const fixture = TestBed.createComponent(ContractorSignupComponent);
    expect(fixture.componentInstance.email()).toBe('');
  });

  it('marks email invalid when empty', () => {
    const fixture = TestBed.createComponent(ContractorSignupComponent);
    expect(fixture.componentInstance.isEmailValid()).toBe(false);
  });

  it('marks email invalid when malformed', () => {
    const fixture = TestBed.createComponent(ContractorSignupComponent);
    fixture.componentInstance.onEmailInput('not-an-email');
    expect(fixture.componentInstance.isEmailValid()).toBe(false);

    fixture.componentInstance.onEmailInput('missing-domain@');
    expect(fixture.componentInstance.isEmailValid()).toBe(false);

    fixture.componentInstance.onEmailInput('no-at-sign.fr');
    expect(fixture.componentInstance.isEmailValid()).toBe(false);
  });

  it('accepts a well-formed email address', () => {
    const fixture = TestBed.createComponent(ContractorSignupComponent);
    fixture.componentInstance.onEmailInput('jean.dupont@exemple.fr');
    expect(fixture.componentInstance.isEmailValid()).toBe(true);
  });

  it('disables submit when phone is valid but email is missing', () => {
    const fixture = TestBed.createComponent(ContractorSignupComponent);
    const c = fixture.componentInstance;

    c.onPhoneInput('06 12 34 56 78');
    expect(c.isPhoneValid()).toBe(true);
    expect(c.isEmailValid()).toBe(false);

    expect(c.canSubmitIdentity()).toBe(false);
  });

  it('disables submit when email is valid but phone is missing', () => {
    const fixture = TestBed.createComponent(ContractorSignupComponent);
    const c = fixture.componentInstance;

    c.onEmailInput('jean@exemple.fr');
    expect(c.isEmailValid()).toBe(true);
    expect(c.isPhoneValid()).toBe(false);

    expect(c.canSubmitIdentity()).toBe(false);
  });

  it('enables submit when both phone and email are valid', () => {
    const fixture = TestBed.createComponent(ContractorSignupComponent);
    const c = fixture.componentInstance;

    c.onPhoneInput('06 12 34 56 78');
    c.onEmailInput('jean@exemple.fr');

    expect(c.canSubmitIdentity()).toBe(true);
  });

  it('sends the email in the signup payload', () => {
    const fixture = TestBed.createComponent(ContractorSignupComponent);
    const c = fixture.componentInstance;

    c.code.set('AB23');
    c.step.set('identity');
    c.onPhoneInput('06 12 34 56 78');
    c.onEmailInput(' jean.dupont@exemple.fr ');

    c.submitIdentity();

    expect(apiSpy.signup).toHaveBeenCalledOnce();
    const payload = apiSpy.signup.mock.calls[0][0];
    expect(payload.email).toBe('jean.dupont@exemple.fr');
    expect(payload.phone).toBe('P33612345678');
    expect(payload.code).toBe('AB23');
  });

  it('does not submit when email is missing even if submitIdentity is called', () => {
    const fixture = TestBed.createComponent(ContractorSignupComponent);
    const c = fixture.componentInstance;

    c.code.set('AB23');
    c.step.set('identity');
    c.onPhoneInput('06 12 34 56 78');
    // email left empty intentionally

    c.submitIdentity();

    expect(apiSpy.signup).not.toHaveBeenCalled();
  });
});
