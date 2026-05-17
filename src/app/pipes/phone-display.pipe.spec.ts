import { describe, expect, it } from 'vitest';
import { PhoneDisplayPipe } from './phone-display.pipe';

describe('PhoneDisplayPipe', () => {
  const pipe = new PhoneDisplayPipe();

  describe('format Tuita P33...', () => {
    it('convertit P33... en +33 ... formaté FR', () => {
      expect(pipe.transform('P33756874218')).toBe('+33 7 56 87 42 18');
    });

    it('gère le P minuscule', () => {
      expect(pipe.transform('p33756874218')).toBe('+33 7 56 87 42 18');
    });

    it('garde un préfixe non-FR en + mais sans regroupement', () => {
      expect(pipe.transform('P441234567890')).toBe('+441234567890');
    });
  });

  describe('format international +', () => {
    it('formate +33... en FR', () => {
      expect(pipe.transform('+33756874218')).toBe('+33 7 56 87 42 18');
    });

    it('garde un + non-FR tel quel', () => {
      expect(pipe.transform('+12025550100')).toBe('+12025550100');
    });
  });

  describe('format national FR (0...)', () => {
    it('formate 0612345678 par groupes de 2', () => {
      expect(pipe.transform('0612345678')).toBe('06 12 34 56 78');
    });
  });

  describe('format masqué RGPD', () => {
    it('convertit "P33******18" en "+33******18"', () => {
      expect(pipe.transform('P33******18')).toBe('+33******18');
    });

    it('laisse "+33******18" intact (déjà OK)', () => {
      expect(pipe.transform('+33******18')).toBe('+33******18');
    });
  });

  describe('valeurs invalides / edge cases', () => {
    it('retourne "" pour null', () => {
      expect(pipe.transform(null)).toBe('');
    });

    it('retourne "" pour undefined', () => {
      expect(pipe.transform(undefined)).toBe('');
    });

    it('retourne "" pour string vide', () => {
      expect(pipe.transform('')).toBe('');
    });

    it('retourne "" pour whitespace only', () => {
      expect(pipe.transform('   ')).toBe('');
    });

    it('retourne tel quel pour un format inconnu', () => {
      expect(pipe.transform('abcdef')).toBe('abcdef');
    });

    it('trim les espaces autour', () => {
      expect(pipe.transform('  P33756874218  ')).toBe('+33 7 56 87 42 18');
    });
  });
});
