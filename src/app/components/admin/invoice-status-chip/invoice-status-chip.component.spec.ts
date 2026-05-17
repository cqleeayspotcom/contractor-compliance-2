import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InvoiceStatusChipComponent } from './invoice-status-chip.component';

describe('InvoiceStatusChipComponent', () => {
  let fixture: ComponentFixture<InvoiceStatusChipComponent>;

  beforeEach(() => {
    fixture = TestBed.createComponent(InvoiceStatusChipComponent);
  });

  it('renders FR label for known status', () => {
    fixture.componentRef.setInput('status', 'ready_to_pay');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Bon pour paiement');
  });

  it('falls back to raw status for unknown', () => {
    fixture.componentRef.setInput('status', 'weird');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('weird');
  });
});
