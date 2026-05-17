import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { KpiTileComponent } from './kpi-tile.component';

describe('KpiTileComponent', () => {
  it('renders icon, label, value, sub', () => {
    const f = TestBed.createComponent(KpiTileComponent);
    f.componentRef.setInput('icon', 'euro');
    f.componentRef.setInput('label', 'Attendu');
    f.componentRef.setInput('value', '500 €');
    f.componentRef.setInput('sub', '5 jours');
    f.detectChanges();
    const t = (fixture: any) => fixture.nativeElement.textContent;
    expect(t(f)).toContain('Attendu');
    expect(t(f)).toContain('500 €');
    expect(t(f)).toContain('5 jours');
  });
});
