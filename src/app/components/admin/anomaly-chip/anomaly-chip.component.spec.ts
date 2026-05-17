import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AnomalyChipComponent } from './anomaly-chip.component';

describe('AnomalyChipComponent', () => {
  it('shows label and applies level class', () => {
    const f = TestBed.createComponent(AnomalyChipComponent);
    f.componentRef.setInput('level', 'critical');
    f.componentRef.setInput('label', 'Mission cancelled');
    f.detectChanges();
    expect(f.nativeElement.outerHTML).toContain('anom--critical');
    expect(f.nativeElement.textContent).toContain('Mission cancelled');
  });
});
