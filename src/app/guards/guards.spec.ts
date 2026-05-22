/**
 * Unsaved Changes Guard — Unit Tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import {
  unsavedChangesGuard,
  CanComponentDeactivate,
} from './unsaved-changes.guard';

/**
 * Faux MatDialog : `open()` renvoie une ref dont `afterClosed()` émet la
 * valeur configurée par chaque test (true = l'utilisateur confirme).
 */
class FakeMatDialog {
  afterClosed$: Observable<boolean> = of(true);
  open = vi.fn(() => ({
    afterClosed: () => this.afterClosed$,
  }) as unknown as MatDialogRef<unknown>);
}

describe('unsavedChangesGuard', () => {
  let dialog: FakeMatDialog;

  beforeEach(() => {
    dialog = new FakeMatDialog();
    TestBed.configureTestingModule({
      providers: [{ provide: MatDialog, useValue: dialog }],
    });
  });

  // Le guard est une CanDeactivateFn fonctionnelle : elle appelle `inject()`
  // et doit donc tourner dans un contexte d'injection. Le router en fournit un
  // en production ; en test on le simule via TestBed.runInInjectionContext.
  function runGuard(component: CanComponentDeactivate) {
    return TestBed.runInInjectionContext(() =>
      (unsavedChangesGuard as unknown as (c: CanComponentDeactivate) => unknown)(
        component,
      ),
    );
  }

  it('should allow navigation when there are no unsaved changes', () => {
    const result = runGuard({ hasUnsavedChanges: () => false });
    expect(result).toBe(true);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('should allow navigation when hasUnsavedChanges is not defined', () => {
    const result = runGuard({} as CanComponentDeactivate);
    expect(result).toBe(true);
  });

  it('should open the Material confirmation dialog when unsaved changes exist and no custom dialog', () => {
    dialog.afterClosed$ = of(true);

    const result = runGuard({ hasUnsavedChanges: () => true }) as Observable<boolean>;

    expect(dialog.open).toHaveBeenCalledTimes(1);
    let emitted: boolean | undefined;
    result.subscribe((v) => (emitted = v));
    expect(emitted).toBe(true);
  });

  it('should block navigation when the user cancels the confirmation dialog', () => {
    dialog.afterClosed$ = of(false);

    const result = runGuard({ hasUnsavedChanges: () => true }) as Observable<boolean>;

    expect(dialog.open).toHaveBeenCalledTimes(1);
    let emitted: boolean | undefined;
    result.subscribe((v) => (emitted = v));
    expect(emitted).toBe(false);
  });

  it('should use custom dialog when provided and return observable', () => {
    const result = runGuard({
      hasUnsavedChanges: () => true,
      showUnsavedChangesDialog: () => of(true),
    }) as Observable<boolean>;

    expect(dialog.open).not.toHaveBeenCalled();
    let emitted: boolean | undefined;
    result.subscribe((v) => (emitted = v));
    expect(emitted).toBe(true);
  });

  it('should use custom dialog when provided and return boolean', () => {
    const result = runGuard({
      hasUnsavedChanges: () => true,
      showUnsavedChangesDialog: () => false,
    });
    expect(result).toBe(false);
  });

  it('should use custom dialog when provided and return promise', async () => {
    const result = runGuard({
      hasUnsavedChanges: () => true,
      showUnsavedChangesDialog: () => Promise.resolve(true),
    });
    await expect(result).resolves.toBe(true);
  });
});
