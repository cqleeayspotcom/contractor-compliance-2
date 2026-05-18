/**
 * Global test setup pour le builder `@angular/build:unit-test` (runner Vitest).
 *
 * Le builder initialise déjà :
 *   - les polyfills (zone.js, etc.)
 *   - l'environnement TestBed (BrowserDynamicTesting + platformBrowserDynamicTesting)
 *
 * On ne refait donc PAS `initTestEnvironment` ici (sinon : double init).
 *
 * Ce fichier complète ce que le builder ne fait pas :
 *
 *   1) `resolveComponentResources` — charge templateUrl / styleUrl externes
 *      pour que `TestBed.createComponent(X)` ne tombe pas sur
 *      "Component 'X' is not resolved: templateUrl/styleUrl".
 *
 *   2) Polyfills jsdom — `sessionStorage` / `localStorage` ne sont pas
 *      toujours disponibles selon la version de jsdom utilisée.
 */

import { beforeAll } from 'vitest';
// `ɵresolveComponentResources` est l'API "internal-public" Angular (préfixe ɵ).
// C'est exactement ce que `ng test` appelle en interne pour pré-charger les
// templateUrl / styleUrl avant que TestBed instancie les composants.
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';

// ----- Résolution des templateUrl / styleUrl --------------------------------
beforeAll(async () => {
  await resolveComponentResources(async (url: string) => {
    const response = await fetch(url);
    return response.text();
  });
});

// ----- Polyfills jsdom ------------------------------------------------------
class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, String(value)); }
}

if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    writable: false,
    configurable: true,
  });
}
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: false,
    configurable: true,
  });
}
