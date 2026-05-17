import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

import {
  DocumentScannerService,
  SCANNER_ENGINE_LOADER,
  type ScannerCorners,
  type ScannerEngine,
} from './document-scanner.service';

function setUp(loaderOverride?: () => Promise<ScannerEngine>) {
  const engine: ScannerEngine = {
    detectCorners: vi.fn().mockReturnValue(null),
    extractPaper: vi.fn().mockImplementation(() => document.createElement('canvas')),
  };
  const loader = loaderOverride ?? vi.fn().mockResolvedValue(engine);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: SCANNER_ENGINE_LOADER, useValue: loader }],
  });
  return { service: TestBed.inject(DocumentScannerService), engine, loader };
}

describe('DocumentScannerService', () => {
  beforeEach(() => {
    // Restore any monkey-patched globals between tests.
    vi.restoreAllMocks();
  });

  describe('loadEngine', () => {
    it('returns the same Promise on repeated calls (idempotent, lazy-load cache)', async () => {
      const { service, loader } = setUp();
      const p1 = service.loadEngine();
      const p2 = service.loadEngine();
      expect(p1).toBe(p2);
      await p1;
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('does not re-invoke the loader after success', async () => {
      const { service, loader } = setUp();
      await service.loadEngine();
      await service.loadEngine();
      await service.loadEngine();
      expect(loader).toHaveBeenCalledTimes(1);
    });
  });

  describe('readImage', () => {
    it('rejects non-image files immediately', async () => {
      const { service } = setUp();
      const pdf = new File([new Uint8Array([0x25, 0x50])], 'doc.pdf', {
        type: 'application/pdf',
      });
      await expect(service.readImage(pdf)).rejects.toThrow(/image/i);
    });

    it('rejects when the browser cannot decode the image bytes', async () => {
      // jsdom Image.onerror fires synchronously when we set an invalid src in
      // tests like this — assigning a fake type is enough to enter the
      // happy-path branch, then the broken `src` triggers `onerror`.
      const { service } = setUp();
      // Force `onerror` to fire by stubbing `URL.createObjectURL` to return
      // an invalid URL that jsdom will refuse.
      const originalCreate = URL.createObjectURL;
      const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
      URL.createObjectURL = vi.fn().mockReturnValue('blob:fake');

      const img = new File([new Uint8Array([0, 1, 2])], 'broken.jpg', { type: 'image/jpeg' });

      // Patch the Image prototype so onerror fires after src assignment.
      const originalSrc = Object.getOwnPropertyDescriptor(
        HTMLImageElement.prototype,
        'src',
      );
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        set(this: HTMLImageElement) {
          queueMicrotask(() => this.onerror?.(new Event('error')));
        },
        get() {
          return '';
        },
      });

      try {
        await expect(service.readImage(img)).rejects.toThrow(/décoder/i);
        expect(revoke).toHaveBeenCalled();
      } finally {
        if (originalSrc) {
          Object.defineProperty(HTMLImageElement.prototype, 'src', originalSrc);
        }
        URL.createObjectURL = originalCreate;
      }
    });
  });

  describe('computeOutputSize', () => {
    it('matches the longest pair of opposing sides', () => {
      const { service } = setUp();
      const corners: ScannerCorners = {
        topLeftCorner: { x: 0, y: 0 },
        topRightCorner: { x: 400, y: 0 },
        bottomLeftCorner: { x: 0, y: 300 },
        bottomRightCorner: { x: 400, y: 300 },
      };
      expect(service.computeOutputSize(corners)).toEqual({ width: 400, height: 300 });
    });

    it('downscales when the largest dimension exceeds 2400 px', () => {
      const { service } = setUp();
      const corners: ScannerCorners = {
        topLeftCorner: { x: 0, y: 0 },
        topRightCorner: { x: 4800, y: 0 },
        bottomLeftCorner: { x: 0, y: 3600 },
        bottomRightCorner: { x: 4800, y: 3600 },
      };
      // 4800 → 2400, scaled by 0.5 → height becomes 1800.
      expect(service.computeOutputSize(corners)).toEqual({ width: 2400, height: 1800 });
    });

    it('defends against degenerate corners (zero-area quadrilateral)', () => {
      const { service } = setUp();
      const zeroCorners: ScannerCorners = {
        topLeftCorner: { x: 0, y: 0 },
        topRightCorner: { x: 0, y: 0 },
        bottomLeftCorner: { x: 0, y: 0 },
        bottomRightCorner: { x: 0, y: 0 },
      };
      const out = service.computeOutputSize(zeroCorners);
      expect(out.width).toBeGreaterThanOrEqual(1);
      expect(out.height).toBeGreaterThanOrEqual(1);
    });
  });

  describe('defaultCorners', () => {
    it('produces an inset rectangle with 5% padding on each side', () => {
      const { service } = setUp();
      const corners = service.defaultCorners({ width: 1000, height: 800 });
      expect(corners.topLeftCorner).toEqual({ x: 50, y: 40 });
      expect(corners.topRightCorner).toEqual({ x: 950, y: 40 });
      expect(corners.bottomLeftCorner).toEqual({ x: 50, y: 760 });
      expect(corners.bottomRightCorner).toEqual({ x: 950, y: 760 });
    });
  });

  describe('canvasToJpegBlob', () => {
    it('resolves with the Blob produced by canvas.toBlob', async () => {
      const { service } = setUp();
      const canvas = document.createElement('canvas');
      canvas.width = 10;
      canvas.height = 10;
      const fakeBlob = new Blob(['x'], { type: 'image/jpeg' });
      vi.spyOn(canvas, 'toBlob').mockImplementation((cb) => {
        cb?.(fakeBlob);
      });
      const result = await service.canvasToJpegBlob(canvas);
      expect(result).toBe(fakeBlob);
    });

    it('rejects when the browser refuses to encode the canvas', async () => {
      const { service } = setUp();
      const canvas = document.createElement('canvas');
      vi.spyOn(canvas, 'toBlob').mockImplementation((cb) => {
        cb?.(null);
      });
      await expect(service.canvasToJpegBlob(canvas)).rejects.toThrow(/JPEG/i);
    });
  });
});
