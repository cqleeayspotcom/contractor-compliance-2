import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { MissionPickerComponent } from './mission-picker.component';
import { ContractorApiService, ContractorMission, MissionsResponse } from '../../services/contractor-api.service';
import { InvoiceStatusFront } from '../../api/models/invoice-status-front';

function mission(overrides: Partial<ContractorMission> = {}): ContractorMission {
  return {
    mid: 'mid-1',
    caseNumber: 'CMD-001',
    missionTitle: 'Pose Starlink',
    operationType: 'starlink',
    operationTypeLabel: 'Starlink',
    price: 250,
    targetAddress: '1 rue X',
    city: 'Lyon',
    visitDateConfirmed: '2026-04-01T10:00',
    signedAt: '2026-04-01T12:00:00.000Z',
    canRun: false,
    invoice_status: InvoiceStatusFront.NONE,
    ...overrides,
  };
}

function buildResponse(missions: ContractorMission[]): MissionsResponse {
  return {
    success: true,
    data: missions,
    meta: {
      total: missions.length,
      filtered_total: missions.length,
      page: 1,
      per_page: missions.length || 20,
      last_page: 1,
      realized: 0,
      realized_to_invoice: 0,
      invoice_status_counts: {},
    },
  };
}

function createFixture(apiStub: Partial<ContractorApiService>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MissionPickerComponent],
    providers: [
      provideNoopAnimations(),
      { provide: ContractorApiService, useValue: apiStub },
    ],
  });
  const fixture = TestBed.createComponent(MissionPickerComponent);
  fixture.detectChanges();
  return fixture;
}

describe('MissionPickerComponent', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('charge les missions facturables au ngOnInit', () => {
    const getMissions = vi.fn().mockReturnValue(of(buildResponse([mission()])));
    const fixture = createFixture({ getMissions } as any);

    expect(getMissions).toHaveBeenCalledWith('invoiceable');
    expect(fixture.componentInstance.availableMissions().length).toBe(1);
  });

  it('filtre les missions sans signedAt, gratuites ou deja facturees', () => {
    const list = [
      mission({ mid: '1', caseNumber: 'OK', signedAt: '2026-04-01', price: 100, invoice_status: InvoiceStatusFront.NONE }),
      mission({ mid: '2', caseNumber: 'NO_SIGN', signedAt: null }),
      mission({ mid: '3', caseNumber: 'FREE', price: 0 }),
      mission({ mid: '4', caseNumber: 'PAID', invoice_status: InvoiceStatusFront.PAID }),
      mission({ mid: '5', caseNumber: 'PENDING', invoice_status: InvoiceStatusFront.PENDING_VALIDATION }),
    ];
    const getMissions = vi.fn().mockReturnValue(of(buildResponse(list)));
    const fixture = createFixture({ getMissions } as any);

    const refs = fixture.componentInstance.availableMissions().map(m => m.caseNumber);
    expect(refs).toEqual(['OK']);
  });

  it('filtre la recherche par reference, titre ou ville (insensible a la casse)', () => {
    const list = [
      mission({ mid: '1', caseNumber: 'AAA', missionTitle: 'Toit', city: 'Paris' }),
      mission({ mid: '2', caseNumber: 'BBB', missionTitle: 'Antenne', city: 'Lyon' }),
      mission({ mid: '3', caseNumber: 'CCC', missionTitle: 'Solaire', city: 'Marseille' }),
    ];
    const getMissions = vi.fn().mockReturnValue(of(buildResponse(list)));
    const fixture = createFixture({ getMissions } as any);
    const cmp = fixture.componentInstance;

    cmp.search = 'lyon';
    expect(cmp.filtered().map(m => m.caseNumber)).toEqual(['BBB']);

    cmp.search = 'AnTeNne';
    expect(cmp.filtered().map(m => m.caseNumber)).toEqual(['BBB']);

    cmp.search = 'aaa';
    expect(cmp.filtered().map(m => m.caseNumber)).toEqual(['AAA']);

    cmp.search = '';
    expect(cmp.filtered().length).toBe(3);
  });

  it('emet selectionChange avec ref + montant a la selection', () => {
    const m = mission({ caseNumber: 'CMD-X', price: 480 });
    const getMissions = vi.fn().mockReturnValue(of(buildResponse([m])));
    const fixture = createFixture({ getMissions } as any);
    const cmp = fixture.componentInstance;

    const emitted: any[] = [];
    cmp.selectionChange.subscribe(s => emitted.push(s));

    cmp.onSelected({ option: { value: m } } as any);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      mission_ref: 'CMD-X',
      amount_ttc: 480,
      mission: m,
    });
    expect(cmp.isLocked()).toBe(true);
    expect(cmp.displayedRef()).toBe('CMD-X');
    expect(cmp.displayedAmount()).toBe('480.00');
  });

  it('clear() emet null et reload missions si liste vide', () => {
    const getMissions = vi.fn().mockReturnValue(of(buildResponse([mission()])));
    const fixture = createFixture({ getMissions } as any);
    const cmp = fixture.componentInstance;

    cmp.onSelected({ option: { value: mission() } } as any);
    cmp.availableMissions.set([]); // simule liste devenue vide

    const emitted: any[] = [];
    cmp.selectionChange.subscribe(s => emitted.push(s));

    cmp.clear();

    expect(emitted).toEqual([null]);
    expect(cmp.isLocked()).toBe(false);
    expect(getMissions).toHaveBeenCalledTimes(2); // 1er load + reload apres clear
  });

  it('clear() ne reload PAS si la liste est deja peuplee', () => {
    const getMissions = vi.fn().mockReturnValue(of(buildResponse([mission(), mission({ mid: '2', caseNumber: 'B' })])));
    const fixture = createFixture({ getMissions } as any);
    const cmp = fixture.componentInstance;

    cmp.onSelected({ option: { value: mission() } } as any);
    cmp.clear();

    expect(getMissions).toHaveBeenCalledTimes(1);
  });

  it('avec initialRef, ne charge pas les missions et passe en locked', () => {
    const getMissions = vi.fn().mockReturnValue(of(buildResponse([mission()])));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MissionPickerComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ContractorApiService, useValue: { getMissions } },
      ],
    });
    const fixture = TestBed.createComponent(MissionPickerComponent);
    fixture.componentRef.setInput('initialRef', 'CMD-PRE');
    fixture.componentRef.setInput('initialAmount', 999);
    fixture.detectChanges();

    expect(getMissions).not.toHaveBeenCalled();
    expect(fixture.componentInstance.isLocked()).toBe(true);
    expect(fixture.componentInstance.displayedRef()).toBe('CMD-PRE');
    expect(fixture.componentInstance.displayedAmount()).toBe('999.00');
  });

  it('gere l erreur API en mettant la liste a vide sans throw', () => {
    const getMissions = vi.fn().mockReturnValue(throwError(() => new Error('boom')));
    const fixture = createFixture({ getMissions } as any);

    expect(fixture.componentInstance.availableMissions()).toEqual([]);
    expect(fixture.componentInstance.missionsLoading()).toBe(false);
  });

  it('displayMission formate correctement', () => {
    const fixture = createFixture({ getMissions: vi.fn().mockReturnValue(of(buildResponse([]))) } as any);
    const cmp = fixture.componentInstance;

    expect(cmp.displayMission(null)).toBe('');
    expect(cmp.displayMission('text')).toBe('text');
    expect(cmp.displayMission(mission({ caseNumber: 'X', missionTitle: 'Y' }))).toBe('X - Y');
  });
});
