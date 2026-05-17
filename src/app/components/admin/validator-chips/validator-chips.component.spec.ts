import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ValidatorChipsComponent } from './validator-chips.component';

describe('ValidatorChipsComponent', () => {
  let fixture: ComponentFixture<ValidatorChipsComponent>;

  beforeEach(() => { fixture = TestBed.createComponent(ValidatorChipsComponent); });

  it('renders 3 chips with correct states', () => {
    fixture.componentRef.setInput('validations',
      { compliance: 'approved', production: null, accounting: 'rejected' });
    fixture.detectChanges();
    const html: string = fixture.nativeElement.outerHTML;
    expect(html).toContain('vchip--approved');
    expect(html).toContain('vchip--pending');
    expect(html).toContain('vchip--rejected');
  });
});
