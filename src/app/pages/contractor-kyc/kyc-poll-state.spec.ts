import { describe, it, expect } from 'vitest';
import { decideNextKycState, shouldRegenerateQr } from './kyc-poll-state';

describe('decideNextKycState', () => {
  it('approved : bascule depuis n\'importe quel état (y compris qr_code)', () => {
    expect(decideNextKycState({ serverStatus: 'approved', phoneConnected: false, currentState: 'qr_code' })).toBe('approved');
    expect(decideNextKycState({ serverStatus: 'approved', phoneConnected: true, currentState: 'phone_connected' })).toBe('approved');
  });

  it('rejected : bascule depuis n\'importe quel état', () => {
    expect(decideNextKycState({ serverStatus: 'rejected', phoneConnected: false, currentState: 'qr_code' })).toBe('rejected');
    expect(decideNextKycState({ serverStatus: 'rejected', phoneConnected: true, currentState: 'phone_connected' })).toBe('rejected');
  });

  it('expired : bascule sur qr_expired', () => {
    expect(decideNextKycState({ serverStatus: 'expired', phoneConnected: false, currentState: 'qr_code' })).toBe('qr_expired');
  });

  it('processing depuis qr_code/phone_connected : bascule sur processing', () => {
    expect(decideNextKycState({ serverStatus: 'processing', phoneConnected: true, currentState: 'qr_code' })).toBe('processing');
    expect(decideNextKycState({ serverStatus: 'processing', phoneConnected: true, currentState: 'phone_connected' })).toBe('processing');
  });

  it('processing alors qu\'on est déjà en processing : reste (null)', () => {
    expect(decideNextKycState({ serverStatus: 'processing', phoneConnected: false, currentState: 'processing' })).toBeNull();
  });

  it('pending + phone_connected depuis qr_code : bascule sur phone_connected', () => {
    expect(decideNextKycState({ serverStatus: 'pending', phoneConnected: true, currentState: 'qr_code' })).toBe('phone_connected');
  });

  it('pending sans scan : reste (null)', () => {
    expect(decideNextKycState({ serverStatus: 'pending', phoneConnected: false, currentState: 'qr_code' })).toBeNull();
  });

  it('pending déjà en phone_connected : reste (null, pas de régression visuelle)', () => {
    expect(decideNextKycState({ serverStatus: 'pending', phoneConnected: true, currentState: 'phone_connected' })).toBeNull();
  });

  it('status null (enveloppe vide) : reste (null)', () => {
    expect(decideNextKycState({ serverStatus: null, phoneConnected: false, currentState: 'qr_code' })).toBeNull();
  });
});

describe('shouldRegenerateQr', () => {
  it('régénère si on est sur le QR et que personne n\'a scanné', () => {
    expect(shouldRegenerateQr({ currentState: 'qr_code', phoneConnected: false })).toBe(true);
  });

  it('NE régénère PAS si le téléphone a scanné (filmage en cours)', () => {
    expect(shouldRegenerateQr({ currentState: 'qr_code', phoneConnected: true })).toBe(false);
  });

  it('NE régénère PAS hors de l\'état qr_code', () => {
    expect(shouldRegenerateQr({ currentState: 'phone_connected', phoneConnected: false })).toBe(false);
    expect(shouldRegenerateQr({ currentState: 'processing', phoneConnected: false })).toBe(false);
  });
});
