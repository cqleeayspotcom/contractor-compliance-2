import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { DocumentScannerDialogComponent } from './document-scanner-dialog.component';
import {
  DocumentScannerService,
  SCANNER_ENGINE_LOADER,
  type ScannerEngine,
} from '../../services/document-scanner.service';

function makeImage(name = 'photo.jpg'): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: 'image/jpeg' });
}

interface SetUpOptions {
  detectReturns?: ReturnType<ScannerEngine['detectCorners']>;
  extractReturns?: HTMLCanvasElement;
  readImageThrows?: Error;
  fileType?: string;
}

function setUp(opts: SetUpOptions = {}) {
  const engine: ScannerEngine = {
    detectCorners: vi.fn().mockReturnValue(opts.detectReturns ?? null),
    extractPaper: vi
      .fn()
      .mockImplementation(() => opts.extractReturns ?? document.createElement('canvas')),
  };
  const loader = vi.fn().mockResolvedValue(engine);
  const dialogRef = { close: vi.fn() } as unknown as MatDialogRef<DocumentScannerDialogComponent>;
  const file = new File([new Uint8Array([1, 2, 3])], 'p.jpg', {
    type: opts.fileType ?? 'image/jpeg',
  });

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideAnimations(),
      { provide: SCANNER_ENGINE_LOADER, useValue: loader },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: MAT_DIALOG_DATA, useValue: { file } },
    ],
  });

  // Stub readImage on the singleton service — we can't load real images in
  // jsdom without OffscreenCanvas + ImageBitmap, and the component contract
  // is just "give me an HTMLImageElement-like with width/height". The mock
  // returns a minimal stand-in with the size we want.
  const service = TestBed.inject(DocumentScannerService);
  const fakeImage = document.createElement('img');
  Object.defineProperty(fakeImage, 'width', { value: 1000, configurable: true });
  Object.defineProperty(fakeImage, 'height', { value: 800, configurable: true });
  if (opts.readImageThrows) {
    vi.spyOn(service, 'readImage').mockRejectedValue(opts.readImageThrows);
  } else {
    vi.spyOn(service, 'readImage').mockResolvedValue({
      image: fakeImage as unknown as HTMLImageElement,
      objectUrl: 'blob:fake',
    });
  }
  vi.spyOn(service, 'canvasToJpegBlob').mockResolvedValue(
    new Blob(['x'], { type: 'image/jpeg' }),
  );

  return { engine, loader, dialogRef, service, fakeImage };
}

async function flush() {
  // Let `Promise.all` + queueMicrotask settle (component ngOnInit chain).
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('DocumentScannerDialogComponent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in "loading" state then transitions to "ready" once the engine resolves', async () => {
    // Détection auto OK → l'ngOnInit passe direct en `ready` (sans détection,
    // le composant bascule en `editing` pour forcer l'ajustement manuel, cf.
    // commentaire dans ngOnInit).
    setUp({
      detectReturns: {
        topLeftCorner: { x: 10, y: 10 },
        topRightCorner: { x: 900, y: 10 },
        bottomLeftCorner: { x: 10, y: 700 },
        bottomRightCorner: { x: 900, y: 700 },
      },
    });
    const fixture = TestBed.createComponent(DocumentScannerDialogComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('loading');
    await flush();
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  it('uses default corners when auto-detection returns null', async () => {
    const { engine } = setUp({ detectReturns: null });
    const fixture = TestBed.createComponent(DocumentScannerDialogComponent);
    fixture.detectChanges();
    await flush();

    expect(engine.detectCorners).toHaveBeenCalledTimes(1);
    const corners = fixture.componentInstance.corners();
    expect(corners).not.toBeNull();
    // 5 % de marge sur une image 1000 × 800 → topLeft = (50, 40).
    expect(corners!.topLeftCorner).toEqual({ x: 50, y: 40 });
  });

  it('uses detected corners when jscanify finds a paper contour', async () => {
    const detected = {
      topLeftCorner: { x: 12, y: 34 },
      topRightCorner: { x: 900, y: 30 },
      bottomLeftCorner: { x: 20, y: 770 },
      bottomRightCorner: { x: 950, y: 780 },
    };
    setUp({ detectReturns: detected });
    const fixture = TestBed.createComponent(DocumentScannerDialogComponent);
    fixture.detectChanges();
    await flush();
    expect(fixture.componentInstance.corners()).toEqual(detected);
  });

  it('transitions to "error" state when readImage rejects', async () => {
    setUp({ readImageThrows: new Error('decode failed') });
    const fixture = TestBed.createComponent(DocumentScannerDialogComponent);
    fixture.detectChanges();
    await flush();
    expect(fixture.componentInstance.state()).toBe('error');
    expect(fixture.componentInstance.errorMessage()).toContain('decode');
  });

  it('closes with "cancel" when user clicks "Reprendre la photo"', async () => {
    const { dialogRef } = setUp();
    const fixture = TestBed.createComponent(DocumentScannerDialogComponent);
    fixture.detectChanges();
    await flush();
    fixture.componentInstance.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith('cancel');
  });

  it('closes with "fallback" when user opts to send the photo as-is', async () => {
    const { dialogRef } = setUp({ readImageThrows: new Error('boom') });
    const fixture = TestBed.createComponent(DocumentScannerDialogComponent);
    fixture.detectChanges();
    await flush();
    fixture.componentInstance.fallback();
    expect(dialogRef.close).toHaveBeenCalledWith('fallback');
  });

  it('confirms with extracted blob payload and the original filename', async () => {
    // Détection auto OK requise : `confirm()` ne fait rien si state !== 'ready'
    // (cf. early-return ligne 228 du composant). Sans `detectReturns`, l'init
    // place le state à `editing` et la validation est ignorée.
    const { dialogRef, engine } = setUp({
      detectReturns: {
        topLeftCorner: { x: 10, y: 10 },
        topRightCorner: { x: 900, y: 10 },
        bottomLeftCorner: { x: 10, y: 700 },
        bottomRightCorner: { x: 900, y: 700 },
      },
    });
    const fixture = TestBed.createComponent(DocumentScannerDialogComponent);
    fixture.detectChanges();
    await flush();
    await fixture.componentInstance.confirm();
    expect(engine.extractPaper).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({
        blob: expect.any(Blob),
        sourceName: 'p.jpg',
      }),
    );
  });

  it('toggles edit mode and exposes corner handle positions in display space', async () => {
    setUp({
      detectReturns: {
        topLeftCorner: { x: 100, y: 100 },
        topRightCorner: { x: 900, y: 100 },
        bottomLeftCorner: { x: 100, y: 700 },
        bottomRightCorner: { x: 900, y: 700 },
      },
    });
    const fixture = TestBed.createComponent(DocumentScannerDialogComponent);
    fixture.detectChanges();
    await flush();

    const instance = fixture.componentInstance;
    expect(instance.state()).toBe('ready');
    instance.startEditing();
    expect(instance.state()).toBe('editing');

    // Force a deterministic displayScale (paint() reads getBoundingClientRect
    // which is 0 × 0 in jsdom layout-less rendering).
    (instance as unknown as { displayScale: { set: (v: number) => void } }).displayScale.set(
      0.5,
    );
    const pos = instance.handlePosition('topRightCorner');
    expect(pos).toEqual({ left: 450, top: 50 });

    instance.applyEdits();
    expect(instance.state()).toBe('ready');
  });
});
