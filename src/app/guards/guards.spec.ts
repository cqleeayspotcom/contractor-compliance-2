/**
 * Unsaved Changes Guard — Unit Tests
 */
import { Observable, of } from 'rxjs';
import {
  unsavedChangesGuard,
  CanComponentDeactivate,
} from './unsaved-changes.guard';

// Helper: invoke the guard with a fake component
function runGuard(component: CanComponentDeactivate) {
  // CanDeactivateFn signature: (component, currentRoute, currentState, nextState)
  return (unsavedChangesGuard as any)(component, {} as any, {} as any, {} as any);
}

describe('unsavedChangesGuard', () => {
  it('should allow navigation when there are no unsaved changes', () => {
    const component: CanComponentDeactivate = {
      hasUnsavedChanges: () => false,
    };

    const result = runGuard(component);
    expect(result).toBe(true);
  });

  it('should allow navigation when hasUnsavedChanges is not defined', () => {
    // Edge case: component without the method
    const component = {} as CanComponentDeactivate;

    const result = runGuard(component);
    expect(result).toBe(true);
  });

  it('should show default confirm when unsaved changes exist and no custom dialog', () => {
    const component: CanComponentDeactivate = {
      hasUnsavedChanges: () => true,
    };

    // Mock window.confirm to return true (user confirms leave)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const result = runGuard(component);
    expect(confirmSpy).toHaveBeenCalled();
    expect(result).toBe(true);

    confirmSpy.mockRestore();
  });

  it('should block navigation when user cancels default confirm', () => {
    const component: CanComponentDeactivate = {
      hasUnsavedChanges: () => true,
    };

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const result = runGuard(component);
    expect(confirmSpy).toHaveBeenCalled();
    expect(result).toBe(false);

    confirmSpy.mockRestore();
  });

  it('should use custom dialog when provided and return observable', () => {
    const component: CanComponentDeactivate = {
      hasUnsavedChanges: () => true,
      showUnsavedChangesDialog: () => of(true),
    };

    const result = runGuard(component) as Observable<boolean>;
    expect(result).toBeDefined();

    // Subscribe to verify the value
    let emitted: boolean | undefined;
    (result as Observable<boolean>).subscribe((v) => (emitted = v));
    expect(emitted).toBe(true);
  });

  it('should use custom dialog when provided and return boolean', () => {
    const component: CanComponentDeactivate = {
      hasUnsavedChanges: () => true,
      showUnsavedChangesDialog: () => false,
    };

    const result = runGuard(component);
    expect(result).toBe(false);
  });

  it('should use custom dialog when provided and return promise', async () => {
    const component: CanComponentDeactivate = {
      hasUnsavedChanges: () => true,
      showUnsavedChangesDialog: () => Promise.resolve(true),
    };

    const result = runGuard(component);
    await expect(result).resolves.toBe(true);
  });
});
