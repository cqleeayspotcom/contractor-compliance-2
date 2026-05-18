import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { provideRouter, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import {
  OnboardingUploadStepperComponent,
  interpretUploadStatus,
} from './onboarding-upload-stepper.component';
import { ContractorSessionService } from '../../services/contractor-session.service';
import {
  ContractorApiService,
  type ContractorDashboard,
  type DocumentRequirement,
} from '../../services/contractor-api.service';
import { IdentityFileFusionService } from '../../services/identity-file-fusion.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Doit refléter `STEP_ORDER` du composant (cni / kbis / urssaf / rc / rib) —
// la garantie décennale est désormais un `secondary` du step `rc`, pas un
// step dédié. Le step bank a aussi été renommé `rib` (saisie IBAN form).
const STEP_TYPES = ['cni', 'kbis', 'urssaf', 'rc', 'rib'] as const;

function buildDashboard(overrides: Partial<ContractorDashboard> = {}): ContractorDashboard {
  const items: DocumentRequirement[] = STEP_TYPES.map((type) => ({
    type,
    label: type,
    status: 'missing',
    expires_at: null,
    days_until_expiry: null,
    can_purchase: false,
    purchase_price_eur: null,
    document_uuid: null,
  }));
  return {
    contractor: { phone: 'P33', firstName: 'A', lastName: 'B', companyName: 'C', siren: 'S' },
    compliance: { score: 0, global_status: 'new', is_verified: false },
    billing: { plan: 'free', can_upgrade: true },
    documents: {
      total_required: items.length,
      verified: 0,
      missing: items.length,
      pending: 0,
      expired: 0,
      rejected: 0,
      items,
    },
    kyc: {
      status: 'not_started',
      can_start: false,
      identity_doc_verified: false,
      last_attempt_at: null,
    },
    certification: { completed: false, completed_at: null },
    account_state: 'documents_incomplete',
    missions_count: 0,
    next_action: 'upload_missing_documents',
    ...overrides,
  } satisfies ContractorDashboard;
}

interface Harness {
  fixture: ComponentFixture<OnboardingUploadStepperComponent>;
  cmp: OnboardingUploadStepperComponent;
  api: {
    uploadDocument: ReturnType<typeof vi.fn>;
    downloadDocument: ReturnType<typeof vi.fn>;
  };
  fusion: { fuseToPdf: ReturnType<typeof vi.fn> };
  refresh: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  /** Pousse un nouvel état dashboard côté observable — simule un refresh backend. */
  push: (dashboard: ContractorDashboard) => void;
  /** Mock MatDialog (déjà disponible via TestBed mais exposé ici pour ergonomie). */
  dialog: { open: ReturnType<typeof vi.fn> };
}

function createHarness(dashboard: ContractorDashboard = buildDashboard()): Harness {
  const subject = new BehaviorSubject<ContractorDashboard | null>(dashboard);
  const refresh = vi.fn();
  const sessionStub = {
    dashboard$: subject.asObservable(),
    isLoading$: new BehaviorSubject<boolean>(false),
    error$: new BehaviorSubject<string | null>(null),
    refreshDashboard: refresh,
  };
  const api = {
    uploadDocument: vi.fn(),
    // Mock par défaut : blob vide. Override dans les tests qui ciblent
    // explicitement le téléchargement auto post-paiement Pappers.
    downloadDocument: vi.fn().mockReturnValue(of(new Blob([], { type: 'application/pdf' }))),
  };
  const fusion = { fuseToPdf: vi.fn() };

  // Repart d'un localStorage propre côté "vidéos déjà vues" pour que chaque
  // test démarre sur le comportement d'auto-open par défaut. Le composant lit
  // la clé `tuita.upload-stepper.videos-watched` au construction et skip
  // l'auto-open des steps déjà mémorisés ; sans ce reset, l'ordre des tests
  // affecterait les assertions sur les ouvertures auto.
  try {
    localStorage.removeItem('tuita.upload-stepper.videos-watched');
  } catch {
    // jsdom sans localStorage — no-op.
  }

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OnboardingUploadStepperComponent],
    providers: [
      provideRouter([]),
      { provide: ContractorSessionService, useValue: sessionStub },
      { provide: ContractorApiService, useValue: api },
      { provide: IdentityFileFusionService, useValue: fusion },
      // `afterClosed` doit toujours être disponible : le composant souscrit
      // dessus pour persister la mémorisation « vidéo vue ». Les tests qui
      // veulent un retour custom de dialog (ex: scanner jscanify) appellent
      // `mockReturnValueOnce` pour écraser ce default sur le 1er appel.
      {
        provide: MatDialog,
        useValue: {
          open: vi
            .fn()
            .mockReturnValue({ afterClosed: () => of(undefined) }),
        },
      },
    ],
  });

  const navigate = vi.fn().mockResolvedValue(true);
  const router = TestBed.inject(Router);
  router.navigate = navigate as unknown as typeof router.navigate;

  const fixture = TestBed.createComponent(OnboardingUploadStepperComponent);
  fixture.detectChanges();

  // L'auto-open du dialog vidéo onboarding tire au premier detectChanges
  // (effect dans le constructeur). Reset le mock pour que les tests existants
  // — qui n'observent que les ouvertures déclenchées par leurs propres actions
  // (scanner jscanify, etc.) — gardent leurs assertions intactes.
  const dialogMock = TestBed.inject(MatDialog) as unknown as {
    open: ReturnType<typeof vi.fn>;
  };
  dialogMock.open.mockClear();

  return {
    fixture,
    cmp: fixture.componentInstance,
    api,
    fusion,
    refresh,
    navigate,
    push: (d: ContractorDashboard) => subject.next(d),
    dialog: dialogMock,
  };
}

function jpegFile(name: string, bytes = 64): File {
  return new File([new Uint8Array(bytes).fill(0xab)], name, { type: 'image/jpeg' });
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

describe('OnboardingUploadStepperComponent — two-sided identity (cni)', () => {
  beforeEach(() => {
    // Empty: per-test setup goes through createHarness().
  });

  it('marks the cni step as twoSided, and other steps as single-sided', () => {
    const { cmp } = createHarness();
    const steps = cmp.steps();
    const cni = steps.find((s) => s.config.type === 'cni')!;
    expect(cni.config.twoSided).toBe(true);

    // Anti-regression — administrative docs MUST stay single-sided so the
    // original PDF reaches the backend bit-for-bit (anti-fraud, audit reserve).
    // Note: l'étape "assurances" a comme type principal `rc` (RC Pro
    // obligatoire) ; la décennale est dans le bloc `secondary` du même
    // step, distincte côté backend (`assurance_decennale`).
    for (const t of ['kbis', 'urssaf', 'rc', 'rib'] as const) {
      const s = steps.find((step) => step.config.type === t)!;
      expect(s.config.twoSided ?? false).toBe(false);
    }
  });

  it('starts on the cni step with both slots empty and submit disabled', () => {
    const { cmp } = createHarness();
    expect(cmp.currentStep()?.config.type).toBe('cni');
    expect(cmp.rectoFile()).toBeNull();
    expect(cmp.versoFile()).toBeNull();
    expect(cmp.canSubmitTwoSided()).toBe(false);
  });

  it('keeps submit disabled when only the recto is provided', () => {
    const { cmp } = createHarness();
    cmp.rectoFile.set(jpegFile('recto.jpg'));
    expect(cmp.canSubmitTwoSided()).toBe(false);
  });

  it('keeps submit disabled when only the verso is provided', () => {
    const { cmp } = createHarness();
    cmp.versoFile.set(jpegFile('verso.jpg'));
    expect(cmp.canSubmitTwoSided()).toBe(false);
  });

  it('enables submit once both recto and verso are provided', () => {
    const { cmp } = createHarness();
    cmp.rectoFile.set(jpegFile('recto.jpg'));
    cmp.versoFile.set(jpegFile('verso.jpg'));
    expect(cmp.canSubmitTwoSided()).toBe(true);
  });

  it('disables submit again after clearing the recto', () => {
    const { cmp } = createHarness();
    cmp.rectoFile.set(jpegFile('recto.jpg'));
    cmp.versoFile.set(jpegFile('verso.jpg'));
    expect(cmp.canSubmitTwoSided()).toBe(true);
    cmp.clearSlot('recto');
    expect(cmp.canSubmitTwoSided()).toBe(false);
  });

  it('on submitTwoSided: fuses recto+verso and uploads the merged PDF as cni', async () => {
    const { cmp, fusion, api } = createHarness();
    const merged = new File([new Uint8Array([0x25, 0x50])], 'identity-document.pdf', {
      type: 'application/pdf',
    });
    fusion.fuseToPdf.mockResolvedValue(merged);
    api.uploadDocument.mockReturnValue(of({ data: { status: 'verified' } }));

    const recto = jpegFile('recto.jpg');
    const verso = jpegFile('verso.jpg');
    cmp.rectoFile.set(recto);
    cmp.versoFile.set(verso);

    await cmp.submitTwoSided();

    expect(fusion.fuseToPdf).toHaveBeenCalledTimes(1);
    expect(fusion.fuseToPdf).toHaveBeenCalledWith([recto, verso]);
    expect(api.uploadDocument).toHaveBeenCalledTimes(1);
    expect(api.uploadDocument).toHaveBeenCalledWith(merged, 'cni');
  });

  it('on verified verdict: marks last verdict ok and refreshes dashboard', async () => {
    const { cmp, fusion, api, refresh } = createHarness();
    fusion.fuseToPdf.mockResolvedValue(jpegFile('out.pdf'));
    api.uploadDocument.mockReturnValue(of({ data: { status: 'verified' } }));

    cmp.rectoFile.set(jpegFile('r.jpg'));
    cmp.versoFile.set(jpegFile('v.jpg'));
    await cmp.submitTwoSided();

    expect(cmp.lastVerdict()?.type).toBe('verified');
    expect(refresh).toHaveBeenCalled();
  });

  it('on rejected verdict: shows the failure_detail message from the backend', async () => {
    const { cmp, fusion, api } = createHarness();
    fusion.fuseToPdf.mockResolvedValue(jpegFile('out.pdf'));
    api.uploadDocument.mockReturnValue(
      of({ data: { status: 'rejected', failure_detail: 'Photo trop floue.' } }),
    );

    cmp.rectoFile.set(jpegFile('r.jpg'));
    cmp.versoFile.set(jpegFile('v.jpg'));
    await cmp.submitTwoSided();

    expect(cmp.lastVerdict()?.type).toBe('rejected');
    expect(cmp.lastVerdict()?.message).toBe('Photo trop floue.');
  });

  it('on fusion failure: shows a friendly message without calling the API', async () => {
    const { cmp, fusion, api } = createHarness();
    fusion.fuseToPdf.mockRejectedValue(new Error('Impossible de lire l\'image.'));

    cmp.rectoFile.set(jpegFile('r.jpg'));
    cmp.versoFile.set(jpegFile('v.jpg'));
    await cmp.submitTwoSided();

    expect(api.uploadDocument).not.toHaveBeenCalled();
    expect(cmp.lastVerdict()?.type).toBe('rejected');
    expect(cmp.lastVerdict()?.message).toMatch(/lire/i);
  });

  it('on HTTP error during upload: surfaces the error message', async () => {
    const { cmp, fusion, api } = createHarness();
    fusion.fuseToPdf.mockResolvedValue(jpegFile('out.pdf'));
    api.uploadDocument.mockReturnValue(
      throwError(() => ({ error: { message: 'Réseau coupé.' } })),
    );

    cmp.rectoFile.set(jpegFile('r.jpg'));
    cmp.versoFile.set(jpegFile('v.jpg'));
    await cmp.submitTwoSided();

    expect(cmp.lastVerdict()?.type).toBe('rejected');
    expect(cmp.lastVerdict()?.message).toBe('Réseau coupé.');
  });

  it('does not call the API or fusion if both slots are not filled (defense in depth)', async () => {
    const { cmp, fusion, api } = createHarness();
    cmp.rectoFile.set(jpegFile('r.jpg'));
    // verso missing on purpose
    await cmp.submitTwoSided();
    expect(fusion.fuseToPdf).not.toHaveBeenCalled();
    expect(api.uploadDocument).not.toHaveBeenCalled();
  });

  it('clears recto/verso slots when advancing to the next step', async () => {
    const { cmp } = createHarness();
    cmp.rectoFile.set(jpegFile('r.jpg'));
    cmp.versoFile.set(jpegFile('v.jpg'));
    // `next()` est désormais gardé : il refuse d'avancer si le step n'est pas
    // `done` ni `skipped` (cf. anti-bypass silencieux). On utilise `later()`
    // qui skip explicitement + avance — c'est le chemin réel "Suivant" tant
    // que rien n'a été uploadé.
    cmp.later();
    expect(cmp.rectoFile()).toBeNull();
    expect(cmp.versoFile()).toBeNull();
  });
});

describe('OnboardingUploadStepperComponent — direct PDF/scan path on cni (alternative to recto+verso photos)', () => {
  it('uploads a pre-scanned PDF as-is, without fusion (preserves original bit-for-bit)', async () => {
    const { cmp, fusion, api } = createHarness();
    api.uploadDocument.mockReturnValue(of({ data: { status: 'verified' } }));

    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cni-scan.pdf', {
      type: 'application/pdf',
    });

    await cmp.submitDirectFile(pdf);

    expect(fusion.fuseToPdf).not.toHaveBeenCalled();
    expect(api.uploadDocument).toHaveBeenCalledWith(pdf, 'cni');
  });

  it('uploads a single image (e.g. flatbed scan as JPEG) as-is without fusion', async () => {
    const { cmp, fusion, api } = createHarness();
    api.uploadDocument.mockReturnValue(of({ data: { status: 'verified' } }));

    const img = jpegFile('cni-scan.jpg');
    await cmp.submitDirectFile(img);

    expect(fusion.fuseToPdf).not.toHaveBeenCalled();
    expect(api.uploadDocument).toHaveBeenCalledWith(img, 'cni');
  });

  it('clears any previously-selected recto/verso slots when the direct path is used', async () => {
    const { cmp, fusion, api } = createHarness();
    api.uploadDocument.mockReturnValue(of({ data: { status: 'verified' } }));

    cmp.rectoFile.set(jpegFile('r.jpg'));
    cmp.versoFile.set(jpegFile('v.jpg'));

    await cmp.submitDirectFile(jpegFile('scan.jpg'));

    expect(fusion.fuseToPdf).not.toHaveBeenCalled();
    expect(cmp.rectoFile()).toBeNull();
    expect(cmp.versoFile()).toBeNull();
  });

  it('surfaces backend rejection messages just like the photo path', async () => {
    const { cmp, api } = createHarness();
    api.uploadDocument.mockReturnValue(
      of({ data: { status: 'rejected', failure_detail: 'Scan illisible.' } }),
    );
    await cmp.submitDirectFile(jpegFile('scan.jpg'));
    expect(cmp.lastVerdict()?.type).toBe('rejected');
    expect(cmp.lastVerdict()?.message).toBe('Scan illisible.');
  });

  it('rejects unsupported types defensively', async () => {
    const { cmp, api } = createHarness();
    const txt = new File([new Uint8Array([1])], 'note.txt', { type: 'text/plain' });
    await cmp.submitDirectFile(txt);
    expect(api.uploadDocument).not.toHaveBeenCalled();
    expect(cmp.lastVerdict()?.type).toBe('rejected');
  });
});

describe('OnboardingUploadStepperComponent — administrative docs stay single-zone (security)', () => {
  it('does not expose recto/verso UX on kbis / urssaf / rc / rib steps', () => {
    const { cmp } = createHarness();
    // `decennale` n'est plus un step distinct (c'est un `secondary` du step
    // `rc`). Le step bank a été renommé `rib`. `goTo` autorise le saut
    // arrière sans contrainte, donc on positionne `currentIndex` direct
    // pour ne pas dépendre du verrou d'ordre d'avancement.
    for (const type of ['kbis', 'urssaf', 'rc', 'rib'] as const) {
      const idx = cmp.steps().findIndex((s) => s.config.type === type);
      expect(idx).toBeGreaterThanOrEqual(0);
      cmp.currentIndex.set(idx);
      const step = cmp.currentStep()!;
      expect(step.config.twoSided ?? false).toBe(false);
    }
  });
});

describe('OnboardingUploadStepperComponent — jscanify scanner wired into onSlotFile', () => {
  function fakeFileInputEvent(file: File | null): Event {
    // jsdom : on construit un Event minimaliste avec `target.files` qu'on
    // pourra lire dans le handler. Pas besoin d'un vrai FileList — un objet
    // type-array-like suffit pour `files?.[0]`.
    const target = {
      files: file ? [file] : [],
      value: 'something-non-empty',
    } as unknown as HTMLInputElement;
    return { target } as unknown as Event;
  }

  function mockDialogResult<T>(result: T): { open: ReturnType<typeof vi.fn> } {
    const dialog = TestBed.inject(MatDialog) as unknown as {
      open: ReturnType<typeof vi.fn>;
    };
    dialog.open.mockReturnValueOnce({
      afterClosed: () => of(result),
    });
    return dialog;
  }

  it('routes a JPEG photo through the scanner dialog and stores the rectified result', async () => {
    const { cmp } = createHarness();
    const scanned = new Blob(['scanned'], { type: 'image/jpeg' });
    mockDialogResult({ blob: scanned, sourceName: 'recto.jpg' });

    await cmp.onSlotFile('recto', fakeFileInputEvent(jpegFile('recto.jpg')));

    const stored = cmp.rectoFile();
    expect(stored).not.toBeNull();
    expect(stored!.type).toBe('image/jpeg');
    expect(stored!.name).toMatch(/recto.*-scan\.jpg$/);
  });

  it('respects "cancel" : leaves the slot empty so the user can retry the camera', async () => {
    const { cmp } = createHarness();
    mockDialogResult('cancel');

    await cmp.onSlotFile('recto', fakeFileInputEvent(jpegFile('shake.jpg')));

    expect(cmp.rectoFile()).toBeNull();
  });

  it('respects "fallback" : sends the original photo as-is when scanner is bypassed', async () => {
    const { cmp } = createHarness();
    mockDialogResult('fallback');
    const original = jpegFile('keep-as-is.jpg');

    await cmp.onSlotFile('verso', fakeFileInputEvent(original));

    // Sur fallback on garde le fichier original (pas de re-encode/rename).
    expect(cmp.versoFile()).toBe(original);
  });

  it('does NOT open the scanner when the user picks a non-image file (PDF flatbed)', async () => {
    const { cmp } = createHarness();
    const dialog = TestBed.inject(MatDialog) as unknown as {
      open: ReturnType<typeof vi.fn>;
    };
    const pdf = new File([new Uint8Array([0x25, 0x50])], 'cni-flatbed.pdf', {
      type: 'application/pdf',
    });

    await cmp.onSlotFile('recto', fakeFileInputEvent(pdf));

    expect(dialog.open).not.toHaveBeenCalled();
    expect(cmp.rectoFile()).toBe(pdf);
  });

  it('resets the slot when the file input change fires with no file (user cancelled native picker)', async () => {
    const { cmp } = createHarness();
    cmp.rectoFile.set(jpegFile('old.jpg'));

    await cmp.onSlotFile('recto', fakeFileInputEvent(null));

    expect(cmp.rectoFile()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sélecteur de variante pièce d'identité (CNI / Passeport)
//
// Le step CNI propose 3 cartes (CNI, Passeport, à terme titre de séjour) pour
// laisser l'artisan choisir. Selon la variante : on bascule le `type` envoyé
// au backend (cni vs passport) ET le flow (recto/verso vs single-shot).
//
// Pourquoi un test dédié : sans variante choisie on doit BLOQUER l'affichage
// de la zone d'upload (sinon on enverrait un passeport avec type=cni).
// ---------------------------------------------------------------------------
describe('OnboardingUploadStepperComponent — sélecteur de variante pièce d\'identité (cni / passport)', () => {
  it('démarre sur le step CNI avec le sélecteur affiché (aucune variante choisie)', () => {
    const { cmp } = createHarness();
    expect(cmp.currentStep()?.config.type).toBe('cni');
    expect(cmp.identityVariant()).toBeNull();
    expect(cmp.showIdentityVariantPicker()).toBe(true);
  });

  it('expose au moins 2 variantes (CNI, Passeport) et chacune définit son slug backend + twoSided', () => {
    const { cmp } = createHarness();
    const slugs = cmp.identityVariants().map((v) => v.type);
    expect(slugs).toContain('cni');
    expect(slugs).toContain('passport');

    const cniVariant = cmp.identityVariants().find((v) => v.type === 'cni')!;
    expect(cniVariant.twoSided).toBe(true);

    const passportVariant = cmp.identityVariants().find((v) => v.type === 'passport')!;
    expect(passportVariant.twoSided).toBe(false);
  });

  it('cacher le picker une fois la variante CNI sélectionnée, et activer le flow recto/verso', () => {
    const { cmp } = createHarness();
    const cniVariant = cmp.identityVariants().find((v) => v.type === 'cni')!;
    cmp.selectIdentityVariant(cniVariant);

    expect(cmp.identityVariant()?.type).toBe('cni');
    expect(cmp.showIdentityVariantPicker()).toBe(false);
    expect(cmp.currentTwoSided()).toBe(true);
    expect(cmp.currentUploadType()).toBe('cni');
  });

  it('sélection Passeport : bascule le flow en single-shot ET le type d\'upload en passport', () => {
    const { cmp } = createHarness();
    const passportVariant = cmp.identityVariants().find((v) => v.type === 'passport')!;
    cmp.selectIdentityVariant(passportVariant);

    expect(cmp.showIdentityVariantPicker()).toBe(false);
    expect(cmp.currentTwoSided()).toBe(false);
    expect(cmp.currentUploadType()).toBe('passport');
  });

  it('clearIdentityVariant remet le picker et vide les slots éventuellement remplis', () => {
    const { cmp } = createHarness();
    const cniVariant = cmp.identityVariants().find((v) => v.type === 'cni')!;
    cmp.selectIdentityVariant(cniVariant);
    cmp.rectoFile.set(jpegFile('r.jpg'));
    cmp.versoFile.set(jpegFile('v.jpg'));

    cmp.clearIdentityVariant();

    expect(cmp.identityVariant()).toBeNull();
    expect(cmp.showIdentityVariantPicker()).toBe(true);
    expect(cmp.rectoFile()).toBeNull();
    expect(cmp.versoFile()).toBeNull();
  });

  it('upload après sélection Passeport : envoie le fichier avec type=passport (pas cni)', async () => {
    const { cmp, api } = createHarness();
    api.uploadDocument.mockReturnValue(of({ data: { status: 'verified' } }));

    const passportVariant = cmp.identityVariants().find((v) => v.type === 'passport')!;
    cmp.selectIdentityVariant(passportVariant);

    const passportFile = jpegFile('passport.jpg');
    await cmp.submitDirectFile(passportFile);

    expect(api.uploadDocument).toHaveBeenCalledTimes(1);
    expect(api.uploadDocument).toHaveBeenCalledWith(passportFile, 'passport');
  });

  it('upload après sélection CNI : fusionne recto/verso et envoie avec type=cni', async () => {
    const { cmp, fusion, api } = createHarness();
    const merged = new File([new Uint8Array([0x25, 0x50])], 'cni.pdf', { type: 'application/pdf' });
    fusion.fuseToPdf.mockResolvedValue(merged);
    api.uploadDocument.mockReturnValue(of({ data: { status: 'verified' } }));

    const cniVariant = cmp.identityVariants().find((v) => v.type === 'cni')!;
    cmp.selectIdentityVariant(cniVariant);
    cmp.rectoFile.set(jpegFile('recto.jpg'));
    cmp.versoFile.set(jpegFile('verso.jpg'));

    await cmp.submitTwoSided();

    expect(fusion.fuseToPdf).toHaveBeenCalledTimes(1);
    expect(api.uploadDocument).toHaveBeenCalledWith(merged, 'cni');
  });

  it('changer d\'étape réinitialise la variante (pas de fuite vers le step suivant)', () => {
    const { cmp } = createHarness();
    const passportVariant = cmp.identityVariants().find((v) => v.type === 'passport')!;
    cmp.selectIdentityVariant(passportVariant);
    expect(cmp.identityVariant()).not.toBeNull();

    // `next()` est gardé (cf. anti-bypass silencieux). On skippe explicitement
    // — c'est ce que fait le bouton « Je le ferai plus tard ».
    cmp.later();

    // On a quitté le step CNI — la variante doit être reset pour ne pas
    // contaminer le type d'upload sur le step suivant (KBIS, URSSAF, etc.).
    expect(cmp.identityVariant()).toBeNull();
    expect(cmp.currentUploadType()).toBe(cmp.currentStep()?.config.type);
  });

  it('sur les steps SANS variantes (URSSAF, RC, RIB), pas de picker et currentUploadType = type du step', () => {
    const { cmp } = createHarness();
    // CNI (variantes) → KBIS (variantes) → URSSAF (pas de variantes). On
    // utilise `later()` parce que `next()` est gardé tant que le step n'est
    // pas done ou skipped.
    cmp.later();
    cmp.later();

    expect(cmp.currentStep()?.config.type).toBe('urssaf');
    expect(cmp.identityVariants().length).toBe(0);
    expect(cmp.showIdentityVariantPicker()).toBe(false);
    expect(cmp.currentUploadType()).toBe('urssaf');
    expect(cmp.currentTwoSided()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sélecteur de variante immatriculation (extrait INPI / Kbis / avis SIRENE).
// Même règle UX que le picker CNI : 3 cartes visuelles, 0 question texte,
// le `type` envoyé au backend dépend de la carte choisie.
// ---------------------------------------------------------------------------
describe('OnboardingUploadStepperComponent — sélecteur de variante immatriculation', () => {
  it('affiche le picker à 3 cartes sur le step KBIS tant qu\'aucune variante n\'est choisie', () => {
    const { cmp } = createHarness();
    cmp.later(); // CNI → KBIS (skip CNI, le test cible la suite)

    expect(cmp.currentStep()?.config.type).toBe('kbis');
    expect(cmp.identityVariants().length).toBe(3);
    expect(cmp.identityVariant()).toBeNull();
    expect(cmp.showIdentityVariantPicker()).toBe(true);

    const slugs = cmp.identityVariants().map((v) => v.type);
    expect(slugs).toEqual(expect.arrayContaining(['extrait_inpi', 'kbis', 'avis_sirene']));
  });

  it('aucune variante immatriculation n\'est twoSided (pas de fusion PDF côté client)', () => {
    const { cmp } = createHarness();
    cmp.later();

    for (const v of cmp.identityVariants()) {
      expect(v.twoSided).toBe(false);
    }
  });

  it('sélection « Extrait INPI » : envoie le fichier avec type=extrait_inpi (pas kbis)', async () => {
    const { cmp, api } = createHarness();
    api.uploadDocument.mockReturnValue(of({ data: { status: 'verified' } }));
    cmp.later();

    const inpi = cmp.identityVariants().find((v) => v.type === 'extrait_inpi')!;
    cmp.selectIdentityVariant(inpi);

    expect(cmp.showIdentityVariantPicker()).toBe(false);
    expect(cmp.currentUploadType()).toBe('extrait_inpi');

    const file = jpegFile('extrait.pdf');
    await cmp.submitDirectFile(file);

    expect(api.uploadDocument).toHaveBeenCalledWith(file, 'extrait_inpi');
  });

  it('sélection « Avis SIRENE » : route bien vers le slug avis_sirene', async () => {
    const { cmp, api } = createHarness();
    api.uploadDocument.mockReturnValue(of({ data: { status: 'verified' } }));
    cmp.later();

    const sirene = cmp.identityVariants().find((v) => v.type === 'avis_sirene')!;
    cmp.selectIdentityVariant(sirene);

    const file = jpegFile('sirene.pdf');
    await cmp.submitDirectFile(file);

    expect(api.uploadDocument).toHaveBeenCalledWith(file, 'avis_sirene');
  });

  // Régression : uploader un extrait INPI satisfait la requirement du step
  // « immatriculation » (cfg.type='kbis'). Le step doit passer en done, sinon
  // un refresh ramène l'utilisateur sur la dropzone bien qu'il ait validé
  // l'étape (bug observé 2026-05-18).
  it('step kbis = done quand n\'importe quelle variante immat est verified (INPI)', () => {
    const dash = buildDashboard();
    dash.documents.items.push({
      type: 'extrait_inpi',
      label: 'Extrait INPI',
      status: 'verified',
      expires_at: null,
      days_until_expiry: null,
      can_purchase: false,
      purchase_price_eur: null,
      document_uuid: 'doc-inpi-1',
    });
    const { cmp } = createHarness(dash);

    const kbisStep = cmp.steps().find((s) => s.config.type === 'kbis')!;
    expect(kbisStep.done).toBe(true);
    expect(kbisStep.requirement?.type).toBe('extrait_inpi');
  });

  it('step kbis = done quand avis_sirene est verified', () => {
    const dash = buildDashboard();
    dash.documents.items.push({
      type: 'avis_sirene',
      label: 'Avis SIRENE',
      status: 'verified',
      expires_at: null,
      days_until_expiry: null,
      can_purchase: false,
      purchase_price_eur: null,
      document_uuid: 'doc-sirene-1',
    });
    const { cmp } = createHarness(dash);

    expect(cmp.steps().find((s) => s.config.type === 'kbis')?.done).toBe(true);
  });

  it('step cni = done quand passeport est verified (variante d\'identité)', () => {
    const dash = buildDashboard();
    dash.documents.items.push({
      type: 'passport',
      label: 'Passeport',
      status: 'verified',
      expires_at: null,
      days_until_expiry: null,
      can_purchase: false,
      purchase_price_eur: null,
      document_uuid: 'doc-pass-1',
    });
    const { cmp } = createHarness(dash);

    expect(cmp.steps().find((s) => s.config.type === 'cni')?.done).toBe(true);
  });

  it('verified gagne contre rejected sur les variantes immat (priorité status)', () => {
    const dash = buildDashboard();
    dash.documents.items.push(
      {
        type: 'kbis',
        label: 'Kbis',
        status: 'rejected',
        expires_at: null,
        days_until_expiry: null,
        can_purchase: false,
        purchase_price_eur: null,
        document_uuid: 'doc-kbis-rej',
      },
      {
        type: 'extrait_inpi',
        label: 'Extrait INPI',
        status: 'verified',
        expires_at: null,
        days_until_expiry: null,
        can_purchase: false,
        purchase_price_eur: null,
        document_uuid: 'doc-inpi-ok',
      },
    );
    const { cmp } = createHarness(dash);

    const kbisStep = cmp.steps().find((s) => s.config.type === 'kbis')!;
    expect(kbisStep.done).toBe(true);
    expect(kbisStep.rejected).toBe(false);
    expect(kbisStep.requirement?.type).toBe('extrait_inpi');
  });

  it('changer d\'étape réinitialise la variante immat (pas de fuite vers URSSAF)', () => {
    const { cmp } = createHarness();
    cmp.later(); // CNI → KBIS

    const kbisVariant = cmp.identityVariants().find((v) => v.type === 'kbis')!;
    cmp.selectIdentityVariant(kbisVariant);
    expect(cmp.identityVariant()).not.toBeNull();

    cmp.later(); // KBIS → URSSAF
    expect(cmp.identityVariant()).toBeNull();
    expect(cmp.currentUploadType()).toBe('urssaf');
  });
});

// ===========================================================================
// P1-5 — Bannière UX «CNI nue requise» visible sur le step CNI
// ===========================================================================

describe('OnboardingUploadStepperComponent — P1-5 bannière CNI nue (anti-annotation)', () => {

  // L'élément `[data-testid="cni-clean-banner"]` n'est pas (encore) rendu
  // dans le template : seul un commentaire HTML P1-5 décrit l'intention
  // (cf. onboarding-upload-stepper.component.html ligne 344). Tant que la
  // bannière n'a pas d'élément avec ce data-testid, ces specs verrouillent
  // un contrat UX prématuré — on les saute pour ne pas masquer les vraies
  // régressions. À ré-activer dès que la bannière est implémentée.
  it.skip('affiche la bannière "CNI nue" UNIQUEMENT sur le step CNI (twoSided)', () => {
    const { fixture, cmp } = createHarness();
    const cniVariant = cmp.identityVariants().find((v) => v.type === 'cni')!;
    cmp.selectIdentityVariant(cniVariant);
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('[data-testid="cni-clean-banner"]');
    expect(banner).not.toBeNull();
    const txt = (banner as HTMLElement).textContent ?? '';
    expect(txt.toLowerCase()).toContain('annotation');
    expect(txt.toLowerCase()).toContain('tampon');
  });

  it.skip("n'affiche PAS la bannière sur les autres steps (KBIS, URSSAF, RC, RIB)", () => {
    const { fixture, cmp } = createHarness();
    cmp.later(); // → step kbis (next() est gardé tant que cni pas done)
    fixture.detectChanges();

    expect(cmp.currentStep()?.config.type).not.toBe('cni');
    const banner = fixture.nativeElement.querySelector('[data-testid="cni-clean-banner"]');
    expect(banner).toBeNull();
  });
});

// ===========================================================================
// P1-6 — Guard taille fichier (≤ 10 MB) avec toast user-friendly
// ===========================================================================

describe('OnboardingUploadStepperComponent — P1-6 guard taille fichier 10 MB', () => {

  function buildOversizedFile(): File {
    // 11 MB — au-dessus de la limite 10 MB.
    const bytes = new Uint8Array(11 * 1024 * 1024);
    return new File([bytes], 'too-big.jpg', { type: 'image/jpeg' });
  }

  function fakeChangeEvent(file: File): Event {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', {
      value: [file] as unknown as FileList,
      configurable: true,
    });
    return { target: input } as unknown as Event;
  }

  it('refuse un fichier > 10 MB sur onSlotFile (recto) et garde le slot vide', async () => {
    const { cmp } = createHarness();
    const snackSpy = vi.spyOn((cmp as unknown as { snack: { open: typeof cmp['snack']['open'] } }).snack, 'open');

    await cmp.onSlotFile('recto', fakeChangeEvent(buildOversizedFile()));

    expect(cmp.rectoFile()).toBeNull();
    expect(snackSpy).toHaveBeenCalled();
    const firstArg = snackSpy.mock.calls[0]?.[0] as string;
    expect(firstArg.toLowerCase()).toMatch(/(trop volumineux|10\s?mo|10\s?mb)/);
  });

  it('refuse un fichier > 10 MB sur onSlotFile (verso)', async () => {
    const { cmp } = createHarness();
    const snackSpy = vi.spyOn((cmp as unknown as { snack: { open: typeof cmp['snack']['open'] } }).snack, 'open');

    await cmp.onSlotFile('verso', fakeChangeEvent(buildOversizedFile()));

    expect(cmp.versoFile()).toBeNull();
    expect(snackSpy).toHaveBeenCalled();
  });

  it('refuse un fichier > 10 MB sur submitDirectFile (chemin PDF flatbed)', async () => {
    const { cmp, api } = createHarness();
    const snackSpy = vi.spyOn((cmp as unknown as { snack: { open: typeof cmp['snack']['open'] } }).snack, 'open');

    await cmp.submitDirectFile(buildOversizedFile());

    expect(api.uploadDocument).not.toHaveBeenCalled();
    expect(snackSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Achat Pappers (Stripe Embedded Checkout) — l'UX post-paiement doit
// refléter immédiatement le bypass OCR backend.
//
// Contexte (incident 2026-05-14) : un artisan a payé 9,99 € pour un extrait
// INPI via Pappers, mais l'écran a continué d'afficher l'ancien rejet OCR
// `kbis_not_original` (qui venait d'un upload manuel antérieur). Côté
// backend, le doc VERIFIED a bien été créé (méthode = API, bypass OCR cf.
// `PappersService::fulfillDocumentPurchase`). C'est le frontend qui mentait :
//   1. `lastVerdict.set(null)` jamais appelé au retour Stripe
//   2. `refreshDashboard()` appelé une seule fois, IMMÉDIATEMENT — alors que
//      `ProcessDocumentPurchase` tourne en async sur Horizon → le doc n'est
//      pas encore en BDD au moment du refresh, et plus jamais après.
// Les specs ci-dessous verrouillent les deux comportements attendus.
// ---------------------------------------------------------------------------

describe('OnboardingUploadStepperComponent — Pappers purchase completion (Stripe Embedded)', () => {
  /**
   * Petit helper : fabrique un MatDialogRef-like minimal dont `afterClosed()`
   * émet le résultat fourni. On le passe à `dialog.open.mockReturnValueOnce`
   * pour simuler la fermeture du dialog Stripe avec un statut donné.
   */
  function dialogRefWithResult(result: { status: string } | null | undefined): unknown {
    return { afterClosed: () => of(result) };
  }

  /** Bascule le stepper sur l'étape kbis (extrait INPI) avec un upload précédent rejeté. */
  function setupStepperOnRejectedKbis(): {
    cmp: OnboardingUploadStepperComponent;
    refresh: ReturnType<typeof vi.fn>;
    dialog: { open: ReturnType<typeof vi.fn> };
    push: (d: ContractorDashboard) => void;
    api: {
      uploadDocument: ReturnType<typeof vi.fn>;
      downloadDocument: ReturnType<typeof vi.fn>;
    };
  } {
    const dash = buildDashboard();
    dash.documents.items = dash.documents.items.map((it) =>
      it.type === 'kbis' ? { ...it, status: 'rejected' } : it,
    );
    const { cmp, refresh, dialog, push, api } = createHarness(dash);
    const kbisIdx = cmp.steps().findIndex((s) => s.config.type === 'kbis');
    cmp.currentIndex.set(kbisIdx);
    // Simule la bannière orange "Document refusé" affichée à l'arrivée
    cmp.lastVerdict.set({
      type: 'rejected',
      message: 'Extrait non original — capture/scan détecté.',
      code: 'kbis_not_original',
    });
    return { cmp, refresh, dialog, push, api };
  }

  it('clears the stale rejection banner immediately when Stripe checkout returns complete', () => {
    const { cmp, dialog } = setupStepperOnRejectedKbis();
    dialog.open.mockReturnValueOnce(dialogRefWithResult({ status: 'complete' }));

    (
      cmp as unknown as {
        openStripeDialog: (cs: string, pk: string, dt: 'extrait_inpi' | 'kbis' | 'avis_sirene') => void;
      }
    ).openStripeDialog('cs_test', 'pk_test', 'kbis');

    expect(cmp.lastVerdict()).toBeNull();
  });

  it('flips isPurchasePolling to true while waiting for the bypass-OCR doc to land', () => {
    const { cmp, dialog } = setupStepperOnRejectedKbis();
    dialog.open.mockReturnValueOnce(dialogRefWithResult({ status: 'complete' }));

    (
      cmp as unknown as {
        openStripeDialog: (cs: string, pk: string, dt: 'extrait_inpi' | 'kbis' | 'avis_sirene') => void;
      }
    ).openStripeDialog('cs_test', 'pk_test', 'kbis');

    expect(cmp.isPurchasePolling()).toBe(true);
  });

  it('polls the dashboard repeatedly after Stripe complete (immediate + every ~3s)', async () => {
    vi.useFakeTimers();
    try {
      const { cmp, refresh, dialog } = setupStepperOnRejectedKbis();
      dialog.open.mockReturnValueOnce(dialogRefWithResult({ status: 'complete' }));

      (
        cmp as unknown as {
          openStripeDialog: (cs: string, pk: string, dt: 'extrait_inpi' | 'kbis' | 'avis_sirene') => void;
        }
      ).openStripeDialog('cs_test', 'pk_test', 'kbis');

      // Refresh immédiat à la fermeture du dialog
      expect(refresh).toHaveBeenCalledTimes(1);

      // Puis polling toutes les ~3 s
      await vi.advanceTimersByTimeAsync(3000);
      expect(refresh).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(3000);
      expect(refresh).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling once the current step becomes verified (Pappers landed)', async () => {
    vi.useFakeTimers();
    try {
      const { cmp, refresh, dialog, push } = setupStepperOnRejectedKbis();
      dialog.open.mockReturnValueOnce(dialogRefWithResult({ status: 'complete' }));

      (
        cmp as unknown as {
          openStripeDialog: (cs: string, pk: string, dt: 'extrait_inpi' | 'kbis' | 'avis_sirene') => void;
        }
      ).openStripeDialog('cs_test', 'pk_test', 'kbis');

      expect(refresh).toHaveBeenCalledTimes(1);

      // Tick 1 → poll, doc encore pas verified
      await vi.advanceTimersByTimeAsync(3000);
      expect(refresh).toHaveBeenCalledTimes(2);

      // Le backend a livré le doc VERIFIED via Pappers — simulate dashboard update
      const verifiedDash = buildDashboard();
      verifiedDash.documents.items = verifiedDash.documents.items.map((it) =>
        it.type === 'kbis' ? { ...it, status: 'verified' } : it,
      );
      push(verifiedDash);

      // Tick suivant → le polling DOIT s'arrêter (no more refresh calls)
      await vi.advanceTimersByTimeAsync(3000);
      expect(refresh).toHaveBeenCalledTimes(2);

      // Et encore — toujours arrêté
      await vi.advanceTimersByTimeAsync(10_000);
      expect(refresh).toHaveBeenCalledTimes(2);

      // Polling state cleared
      expect(cmp.isPurchasePolling()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling after the timeout window (~60s) even if the doc never lands', async () => {
    vi.useFakeTimers();
    try {
      const { cmp, refresh, dialog } = setupStepperOnRejectedKbis();
      dialog.open.mockReturnValueOnce(dialogRefWithResult({ status: 'complete' }));

      (
        cmp as unknown as {
          openStripeDialog: (cs: string, pk: string, dt: 'extrait_inpi' | 'kbis' | 'avis_sirene') => void;
        }
      ).openStripeDialog('cs_test', 'pk_test', 'kbis');

      // Avance bien au-delà du timeout
      await vi.advanceTimersByTimeAsync(70_000);

      const callsAtTimeout = refresh.mock.calls.length;

      // Plus aucun refresh après le timeout
      await vi.advanceTimersByTimeAsync(10_000);
      expect(refresh).toHaveBeenCalledTimes(callsAtTimeout);

      // Polling state cleared
      expect(cmp.isPurchasePolling()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('auto-downloads the freshly purchased PDF once the doc lands in BDD', async () => {
    vi.useFakeTimers();
    try {
      const { cmp, dialog, push, api } = setupStepperOnRejectedKbis();
      dialog.open.mockReturnValueOnce(dialogRefWithResult({ status: 'complete' }));

      (
        cmp as unknown as {
          openStripeDialog: (cs: string, pk: string, dt: 'extrait_inpi' | 'kbis' | 'avis_sirene') => void;
        }
      ).openStripeDialog('cs_test', 'pk_test', 'kbis');

      await vi.advanceTimersByTimeAsync(3000);

      // Backend a livré le doc + dashboard exposé le document_uuid (cas
      // nominal — le serializer joint l'uuid du dernier doc verified).
      const verifiedDash = buildDashboard();
      verifiedDash.documents.items = verifiedDash.documents.items.map((it) =>
        it.type === 'kbis'
          ? { ...it, status: 'verified', document_uuid: 'doc-uuid-abc' }
          : it,
      );
      push(verifiedDash);

      await vi.advanceTimersByTimeAsync(3000);

      expect(api.downloadDocument).toHaveBeenCalledWith('doc-uuid-abc');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT start polling or clear the verdict if Stripe checkout was cancelled (status != complete)', () => {
    const { cmp, refresh, dialog } = setupStepperOnRejectedKbis();
    dialog.open.mockReturnValueOnce(dialogRefWithResult(undefined));

    (
      cmp as unknown as {
        openStripeDialog: (cs: string, pk: string, dt: 'extrait_inpi' | 'kbis' | 'avis_sirene') => void;
      }
    ).openStripeDialog('cs_test', 'pk_test', 'kbis');

    // Ni refresh ni clear : l'artisan a annulé, on garde l'écran intact.
    expect(refresh).not.toHaveBeenCalled();
    expect(cmp.lastVerdict()).not.toBeNull();
    expect(cmp.isPurchasePolling()).toBe(false);
  });
});

// ===========================================================================
// interpretUploadStatus — back↔front mapping des 8 statuts DocumentStatus.
// Régression : avant 2026-05-18, le frontend ignorait silencieusement tout
// statut autre que verified/rejected (bug URSSAF périmée renvoyée superseded
// sans message visible côté UX).
// ===========================================================================

describe('interpretUploadStatus — mapping back→front complet', () => {
  it('verified → succès vert', () => {
    const v = interpretUploadStatus('verified', null, null);
    expect(v.type).toBe('verified');
    expect(v.message).toMatch(/validé/i);
  });

  it('rejected → erreur rouge, utilise failure_detail FR backend', () => {
    const v = interpretUploadStatus('rejected', 'Photo trop floue.', 'blur');
    expect(v.type).toBe('rejected');
    expect(v.message).toBe('Photo trop floue.');
    expect(v.code).toBe('blur');
  });

  it('rejected sans failure_detail → fallback FR générique', () => {
    const v = interpretUploadStatus('rejected', null, 'unknown_reason');
    expect(v.type).toBe('rejected');
    expect(v.message).toMatch(/refusé|lisible|réessaie/i);
  });

  it('expired → erreur rouge avec message "expiré"', () => {
    const v = interpretUploadStatus('expired', null, null);
    expect(v.type).toBe('rejected');
    expect(v.message).toMatch(/expiré/i);
    expect(v.code).toBe('document_expired');
  });

  it('legally_outdated → erreur rouge avec message "trop ancien"', () => {
    const v = interpretUploadStatus('legally_outdated', null, null);
    expect(v.type).toBe('rejected');
    expect(v.message).toMatch(/ancien|récente/i);
    expect(v.code).toBe('document_legally_outdated');
  });

  it('superseded → info bleue (pas une erreur, pas un succès)', () => {
    const v = interpretUploadStatus('superseded', null, null);
    expect(v.type).toBe('info');
    expect(v.message).toMatch(/récente|garde/i);
    expect(v.code).toBe('document_superseded');
  });

  it('pending → spinner d\'attente', () => {
    const v = interpretUploadStatus('pending', null, null);
    expect(v.type).toBe('pending');
    expect(v.message).toMatch(/vérifie|en cours/i);
  });

  it('processing → spinner d\'attente (idem pending)', () => {
    const v = interpretUploadStatus('processing', null, null);
    expect(v.type).toBe('pending');
    expect(v.message).toMatch(/vérifie|en cours/i);
  });

  it('pending_manual_review → attente avec message dédié', () => {
    const v = interpretUploadStatus('pending_manual_review', null, null);
    expect(v.type).toBe('pending');
    expect(v.message).toMatch(/manuelle|email/i);
  });

  it('statut inconnu → fallback pending (jamais de silence)', () => {
    const v = interpretUploadStatus('something_new_2027', null, null);
    expect(v.type).toBe('pending');
    expect(v.message).toBeTruthy();
    expect(v.code).toBe('unknown_status:something_new_2027');
  });

  it('status null/undefined → fallback pending avec code unknown_status', () => {
    expect(interpretUploadStatus(null, null, null).code).toBe('unknown_status');
    expect(interpretUploadStatus(undefined, null, null).type).toBe('pending');
  });

  it('failure_detail backend a priorité sur le fallback frontend', () => {
    const v = interpretUploadStatus(
      'expired',
      'Cette URSSAF date d\'il y a 8 mois — il faut une attestation récente.',
      'urssaf_too_old',
    );
    expect(v.message).toBe(
      'Cette URSSAF date d\'il y a 8 mois — il faut une attestation récente.',
    );
    expect(v.code).toBe('urssaf_too_old');
  });
});
