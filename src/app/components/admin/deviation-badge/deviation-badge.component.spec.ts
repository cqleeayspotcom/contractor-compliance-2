import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DeviationBadgeComponent } from './deviation-badge.component';

describe('DeviationBadgeComponent', () => {
  it('shows — for null', () => {
    const f = TestBed.createComponent(DeviationBadgeComponent);
    f.detectChanges();
    expect(f.nativeElement.textContent.trim()).toBe('—');
  });
  it('warn class for >5%', () => {
    const f = TestBed.createComponent(DeviationBadgeComponent);
    f.componentRef.setInput('deviationPct', 8.4);
    f.detectChanges();
    expect(f.nativeElement.outerHTML).toContain('dev--warn');
    expect(f.nativeElement.textContent).toContain('+8.4%');
  });
  it('ok class for <=5%', () => {
    const f = TestBed.createComponent(DeviationBadgeComponent);
    f.componentRef.setInput('deviationPct', -2.1);
    f.detectChanges();
    expect(f.nativeElement.outerHTML).toContain('dev--ok');
  });
});
