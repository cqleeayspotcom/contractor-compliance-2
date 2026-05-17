import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AdminDialogShellComponent } from './admin-dialog-shell.component';

describe('AdminDialogShellComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideAnimations()] }));

  it('shows spinner when loading', () => {
    const f = TestBed.createComponent(AdminDialogShellComponent);
    f.componentRef.setInput('loading', true);
    f.detectChanges();
    expect(f.nativeElement.querySelector('mat-spinner')).toBeTruthy();
  });

  it('shows error state', () => {
    const f = TestBed.createComponent(AdminDialogShellComponent);
    f.componentRef.setInput('error', 'Boom');
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Boom');
  });

  it('emits close on header X click', () => {
    const f = TestBed.createComponent(AdminDialogShellComponent);
    let closed = false;
    f.componentInstance.close.subscribe(() => (closed = true));
    f.detectChanges();
    f.nativeElement.querySelector('.shell__header button').click();
    expect(closed).toBe(true);
  });
});
