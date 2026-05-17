import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';

import {
  IdentityFileFusionService,
  IMAGE_RENDERER,
  type ImageRenderer,
} from './identity-file-fusion.service';

// Mock pdf-lib at the module boundary so we can verify the service's
// orchestration (calls into the PDF builder) without exercising the real
// PDF parser/encoder.
vi.mock('pdf-lib', () => {
  const drawImage = vi.fn();
  const fakePage = { drawImage };
  const embedJpg = vi
    .fn()
    .mockImplementation(async (bytes: Uint8Array) => ({
      width: 100 + bytes.length,
      height: 200 + bytes.length,
    }));
  const addPage = vi.fn().mockReturnValue(fakePage);
  const save = vi
    .fn()
    .mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]));
  const create = vi.fn().mockImplementation(async () => ({
    embedJpg,
    addPage,
    save,
  }));
  return {
    PDFDocument: { create },
    __mocks: { create, embedJpg, addPage, save, drawImage },
  };
});

import * as pdfLib from 'pdf-lib';

const mocks = (pdfLib as unknown as { __mocks: Record<string, ReturnType<typeof vi.fn>> })
  .__mocks;

function makeImage(name: string, type = 'image/jpeg', size = 16): File {
  const buf = new Uint8Array(size).fill(0xab);
  return new File([buf], name, { type });
}

interface Harness {
  service: IdentityFileFusionService;
  renderToJpeg: ReturnType<typeof vi.fn>;
}

function setUp(rendererOverride?: Partial<ImageRenderer>): Harness {
  const renderToJpeg = vi.fn(async (file: File) => {
    return new Uint8Array(await file.arrayBuffer());
  });
  const renderer: ImageRenderer = { renderToJpeg, ...rendererOverride };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: IMAGE_RENDERER, useValue: renderer }],
  });

  return {
    service: TestBed.inject(IdentityFileFusionService),
    renderToJpeg,
  };
}

describe('IdentityFileFusionService', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockClear());
  });

  it('rejects an empty input', async () => {
    const { service } = setUp();
    await expect(service.fuseToPdf([])).rejects.toThrow(/au moins/i);
  });

  it('rejects more than 2 files', async () => {
    const { service } = setUp();
    const files = [makeImage('1.jpg'), makeImage('2.jpg'), makeImage('3.jpg')];
    await expect(service.fuseToPdf(files)).rejects.toThrow(/maximum/i);
  });

  it('rejects non-image files', async () => {
    const { service } = setUp();
    const txt = new File([new Uint8Array([1])], 'note.txt', { type: 'text/plain' });
    await expect(service.fuseToPdf([txt])).rejects.toThrow(/image/i);
  });

  it('returns a single-page PDF File when given one image', async () => {
    const { service, renderToJpeg } = setUp();
    const out = await service.fuseToPdf([makeImage('recto.jpg')]);

    expect(out).toBeInstanceOf(File);
    expect(out.type).toBe('application/pdf');
    expect(out.name.toLowerCase()).toMatch(/\.pdf$/);
    expect(out.size).toBeGreaterThan(0);

    expect(renderToJpeg).toHaveBeenCalledTimes(1);
    expect(mocks.embedJpg).toHaveBeenCalledTimes(1);
    expect(mocks.addPage).toHaveBeenCalledTimes(1);
    expect(mocks.drawImage).toHaveBeenCalledTimes(1);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it('returns a 2-page PDF when given recto + verso, in declared order', async () => {
    const { service, renderToJpeg } = setUp();
    const recto = makeImage('recto.jpg', 'image/jpeg', 32);
    const verso = makeImage('verso.jpg', 'image/jpeg', 64);

    await service.fuseToPdf([recto, verso]);

    expect(renderToJpeg).toHaveBeenNthCalledWith(1, recto);
    expect(renderToJpeg).toHaveBeenNthCalledWith(2, verso);
    expect(mocks.embedJpg).toHaveBeenCalledTimes(2);
    expect(mocks.addPage).toHaveBeenCalledTimes(2);
  });

  it('sizes each page to the embedded image (no whitespace, no crop)', async () => {
    const { service } = setUp();
    await service.fuseToPdf([makeImage('a.jpg', 'image/jpeg', 10)]);

    // Mock embedJpg returns { width: 100 + bytes.length, height: 200 + bytes.length }
    // For a 10-byte file → page should be [110, 210].
    expect(mocks.addPage).toHaveBeenCalledWith([110, 210]);
  });

  it('accepts HEIC and WebP (mobile camera realities) by passing them to the renderer', async () => {
    const { service, renderToJpeg } = setUp();
    const heic = makeImage('photo.heic', 'image/heic');
    const webp = makeImage('photo.webp', 'image/webp');

    await service.fuseToPdf([heic, webp]);

    expect(renderToJpeg).toHaveBeenCalledTimes(2);
    expect(mocks.embedJpg).toHaveBeenCalledTimes(2);
  });

  it('propagates a friendly error when the renderer fails (e.g. browser cannot decode HEIC)', async () => {
    const { service } = setUp({
      renderToJpeg: vi.fn().mockRejectedValue(new Error('decode failed')),
    });
    await expect(service.fuseToPdf([makeImage('bad.heic', 'image/heic')])).rejects.toThrow(
      /decode/i,
    );
  });

  it('uses a stable, descriptive output filename', async () => {
    const { service } = setUp();
    const out = await service.fuseToPdf([makeImage('IMG_1234.jpg')]);
    // Stable name regardless of input filename — backend stores the document
    // by its own UUID anyway, the user-facing file picker just sees something
    // sensible if they re-download.
    expect(out.name).toBe('identity-document.pdf');
  });
});
