/**
 * Certification route guards — Unit Tests
 *
 * certificationCompletedGuard: protects /certification/memo — redirects to
 *   /certification if the contractor hasn't certified yet.
 * certificationNotCompletedGuard: protects /certification — redirects to
 *   /certification/memo if the contractor is already certified.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';

import {
  certificationCompletedGuard,
  certificationNotCompletedGuard,
} from './certification.guards';
import { ContractorSessionService } from '../services/contractor-session.service';

function runGuard(
  guard: typeof certificationCompletedGuard | typeof certificationNotCompletedGuard,
  queryParams: Record<string, string> = {},
): boolean | UrlTree {
  const route = {
    queryParamMap: {
      get: (key: string) => queryParams[key] ?? null,
    },
  } as any;
  return TestBed.runInInjectionContext(() => guard(route, {} as any)) as boolean | UrlTree;
}

describe('certificationCompletedGuard', () => {
  let sessionMock: { certificationCompleted: boolean };
  let routerSpy: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sessionMock = { certificationCompleted: false };
    routerSpy = { createUrlTree: vi.fn((commands: unknown[]) => ({ _tree: commands } as unknown as UrlTree)) };

    TestBed.configureTestingModule({
      providers: [
        { provide: ContractorSessionService, useValue: sessionMock },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  it('allows access when contractor has already certified', () => {
    sessionMock.certificationCompleted = true;
    const result = runGuard(certificationCompletedGuard);
    expect(result).toBe(true);
    expect(routerSpy.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirects to /certification when contractor has NOT certified', () => {
    sessionMock.certificationCompleted = false;
    const result = runGuard(certificationCompletedGuard);
    expect(result).not.toBe(true);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/certification']);
  });
});

describe('certificationNotCompletedGuard', () => {
  let sessionMock: { certificationCompleted: boolean };
  let routerSpy: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    sessionMock = { certificationCompleted: false };
    routerSpy = { createUrlTree: vi.fn((commands: unknown[]) => ({ _tree: commands } as unknown as UrlTree)) };

    TestBed.configureTestingModule({
      providers: [
        { provide: ContractorSessionService, useValue: sessionMock },
        { provide: Router, useValue: routerSpy },
      ],
    });
  });

  it('allows access when contractor has NOT certified yet', () => {
    sessionMock.certificationCompleted = false;
    const result = runGuard(certificationNotCompletedGuard);
    expect(result).toBe(true);
    expect(routerSpy.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirects to /certification/memo when contractor has already certified', () => {
    sessionMock.certificationCompleted = true;
    const result = runGuard(certificationNotCompletedGuard);
    expect(result).not.toBe(true);
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/certification/memo']);
  });

  it('allows access for a certified contractor when ?retake=1 is set', () => {
    sessionMock.certificationCompleted = true;
    const result = runGuard(certificationNotCompletedGuard, { retake: '1' });
    expect(result).toBe(true);
    expect(routerSpy.createUrlTree).not.toHaveBeenCalled();
  });
});
