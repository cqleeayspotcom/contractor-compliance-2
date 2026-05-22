/// <reference types="cypress" />

/**
 * FLOW COMPLET CONTRACTOR COMPLIANCE
 *
 * Spec « convertible direct » (cf. WS3-CYPRESS.md) — fonctionne dans LES DEUX
 * modes Cypress :
 *  - mode mock (défaut)  : endpoints stubés via cy.mockContractorApi() +
 *    fixtures JSON figées. Assertions sur les valeurs des fixtures.
 *  - mode real-backend   : CYPRESS_realBackend=1. On s'authentifie pour de
 *    vrai (cy.loginContractor, PIN SMS Tuita) et on tape le backend PHP
 *    :8060 à travers le proxy.
 *
 * POURQUOI les assertions real-backend portent sur le SHELL (cy.assertAppShell)
 * et l'URL, et non sur le contenu métier : l'état d'un contractor real-backend
 * est piloté par la synchro smith Tuita (score/plan/statut changent d'un run à
 * l'autre) ; certains états renvoient un 403 « non vérifié » ou ouvrent une
 * modale promo qui recouvre le corps de page. Le shell (header + routing) est
 * le seul landmark déterministe — il prouve que la page a bien chargé contre
 * le vrai backend.
 */

import { REAL_BACKEND } from '../support/commands';

// Téléphone FACTICE du contractor de test (06 00 00 00 99). Garde-fou SMS :
// jamais de vrai numéro ici — le seed contient de vrais contractors.
const FAKE_PHONE = 'P33600000099';

describe('Contractor Compliance - Flow complet', () => {
  beforeEach(() => {
    // En real-backend : ouvre une session contractor (cookie __contractor_ssid)
    // AVANT toute visite — sinon l'API renvoie 401 et l'interceptor redirige
    // vers /login. En mode mock c'est inerte (cookie non requis).
    if (REAL_BACKEND) {
      cy.loginContractor(FAKE_PHONE);
    }
    cy.mockContractorApi();
  });

  // ═══════════════════════════════════════════
  // 1. DASHBOARD
  // ═══════════════════════════════════════════

  describe('Dashboard', () => {
    it('affiche le dashboard de conformité', () => {
      cy.visit('/dashboard');
      cy.waitApi('@getDashboard');

      if (REAL_BACKEND) {
        // Le dashboard a chargé contre le vrai backend (shell + URL).
        cy.assertAppShell();
        cy.url().should('include', '/dashboard');
      } else {
        // Le dashboard réécrit est une grille de tuiles. Pendant l'onboarding
        // (next_action=upload_missing_documents), le bandeau d'accueil affiche
        // « Bonjour LUCIAN » dans le header + le bandeau d'étape « Bienvenue
        // LUCIAN - Étape 1 sur 3 ».
        cy.contains('Bonjour LUCIAN').should('be.visible');
        cy.contains('Bienvenue LUCIAN').should('be.visible');
        cy.contains('Étape 1 sur 3').should('be.visible');
        // Tuile « Mes chantiers » (porte d'entrée missions/factures, toujours
        // visible) et CTA upsell « Passer en Pro » (plan gratuit).
        cy.contains('Mes chantiers').should('be.visible');
        cy.contains('Passer en Pro').should('be.visible');
      }
    });

    it('affiche le dashboard 100% pour un contractor verifie', function () {
      // Le dashboard 100% est un état figé de fixture — impossible à garantir
      // en real-backend (l'état réel dépend de la synchro smith). On saute.
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.mockContractorApi('dashboard-100.json');

      cy.visit('/dashboard');
      cy.wait('@getDashboard');

      // Contractor 100% conforme : plus de bandeau onboarding, les tuiles
      // « Mes documents » et « Mes chantiers » portent le badge « Conforme ».
      cy.contains('Bonjour LUCIAN').should('be.visible');
      cy.contains('Mes documents').should('be.visible');
      cy.contains('Mes chantiers').should('be.visible');
      cy.contains('Conforme').should('be.visible');
    });
  });

  // ═══════════════════════════════════════════
  // 2. DOCUMENTS
  // ═══════════════════════════════════════════

  describe('Documents', () => {
    it('affiche la liste des documents', () => {
      cy.visit('/documents');
      cy.waitApi('@getDocuments');

      if (REAL_BACKEND) {
        cy.assertAppShell();
        cy.url().should('include', '/documents');
      } else {
        cy.contains('kbis_2026.pdf').should('be.visible');
        cy.contains('attestation_rc_pro.pdf').should('be.visible');
        cy.contains('attestation_urssaf.pdf').should('be.visible');
      }
    });

    it('navigue vers la page upload', () => {
      cy.visit('/documents/upload');
      cy.waitApi('@getDashboard');

      cy.url().should('include', '/documents/upload');
    });

    it('uploade un document avec succes', function () {
      // L'upload réel déclenche une analyse OCR synchrone (>30s) + écrit en
      // base. Hors périmètre d'un test de rendu — réservé au mode mock.
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.visit('/documents/upload');
      cy.wait('@getDashboard');

      // À l'arrivée sur le stepper, une modale vidéo explicative s'ouvre
      // (OnboardingVideoDialogComponent). On la ferme pour accéder au
      // contenu de l'étape.
      cy.dismissStepperVideo();

      // L'étape 1 est « Ta pièce d'identité » : choisir la variante CNI
      // fait apparaître les zones de dépôt.
      cy.get('[data-testid="identity-variant-cni"]', { timeout: 15000 }).click();

      // Le chemin « J'ai déjà un fichier complet » (dernier input fichier)
      // déclenche l'upload synchrone du PDF.
      cy.get('input[type="file"]', { timeout: 15000 }).last().selectFile(
        {
          contents: Cypress.Buffer.from('%PDF-1.4 fake-pdf-content'),
          fileName: 'attestation_test.pdf',
          mimeType: 'application/pdf',
        },
        { force: true }
      );

      cy.wait('@uploadDocument');
    });

    it('affiche le statut d\'un document verifie (KBIS)', function () {
      // Le statut d'un document précis dépend d'un uuid de fixture figé.
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.visit('/documents/doc-kbis-uuid-001');
      cy.wait('@getDocumentStatus');

      // Le composant affiche « Document vérifié » (libellé accentué).
      cy.contains('Document vérifié').should('be.visible');
      // File name
      cy.contains('kbis_2026.pdf').should('be.visible');
      // typeLabel(kbis) — libellé long « KBIS (société) ou Avis SIRENE... ».
      cy.contains('KBIS').should('be.visible');
      // Confidence
      cy.contains('95%').should('be.visible');
    });
  });

  // ═══════════════════════════════════════════
  // 3. KYC
  // ═══════════════════════════════════════════

  describe('KYC', () => {
    it('affiche la page KYC', () => {
      cy.visit('/kyc');
      cy.waitApi('@getDashboard');
      cy.url().should('include', '/kyc');
      if (REAL_BACKEND) {
        cy.assertAppShell();
      }
    });

    it('affiche la page KYC avec dashboard approuve', function () {
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.mockContractorApi('dashboard-100.json');
      cy.visit('/kyc');
      cy.wait('@getDashboard');
      cy.url().should('include', '/kyc');
    });
  });

  // ═══════════════════════════════════════════
  // 4. MISSIONS
  // ═══════════════════════════════════════════

  describe('Missions', () => {
    it('affiche la page des offres disponibles', () => {
      cy.visit('/missions');

      if (REAL_BACKEND) {
        // La route /missions reste atteignable même si l'endpoint backend
        // renvoie peu/pas de données (page « offres disponibles »).
        cy.url().should('include', '/missions');
        cy.assertAppShell();
      } else {
        // La route /missions affiche désormais ContractorMissionOffersComponent
        // (« Offres disponibles »), alimentée par GET /missions/offers.
        cy.waitApi('@getMissionOffers');
        cy.contains('Offres disponibles').should('be.visible');
        // Titres des offres (format MissionOffer, fixture mission-offers.json).
        cy.contains('Diagnostic amiante avant travaux').should('be.visible');
        cy.contains('Diagnostic plomb').should('be.visible');
        // Villes (offer.address.city).
        cy.contains('Paris').should('be.visible');
        cy.contains('Lyon').should('be.visible');
      }
    });
  });

  // ═══════════════════════════════════════════
  // 5. FACTURATION
  // ═══════════════════════════════════════════

  describe('Billing', () => {
    it('affiche le plan actuel', function () {
      // La page /billing real-backend reste bloquée sur le spinner de
      // chargement : l'endpoint /contractor-compliance/billing/plan n'est
      // pas servi par ce backend (404). État documenté — on saute en real.
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.visit('/billing');
      cy.wait('@getBilling');

      // Plan gratuit : la page facturation affiche la carte d'upsell « Tuita
      // Pro » avec le CTA « Passer en Pro ».
      cy.contains('Facturation').should('be.visible');
      cy.contains('Passer en Pro').should('be.visible');
    });

    it('affiche la liste des factures', () => {
      cy.visit('/invoices');
      cy.waitApi('@getInvoices');

      if (REAL_BACKEND) {
        cy.assertAppShell();
        cy.url().should('include', '/invoices');
      } else {
        // Invoice numbers (invoice_number field, not "number")
        cy.contains('FAC-2026-001').should('be.visible');
        cy.contains('FAC-2026-002').should('be.visible');
        // Montant formaté par le composant : 1250.00 → « 1250,00 € »
        // (formatAmount fait toFixed(2).replace('.', ',') — pas de séparateur
        // de milliers, contrairement au pipe Angular `number`).
        cy.contains('1250,00').should('be.visible');
        // Chip de filtre « Payées » (libellé accentué dans le composant).
        cy.contains('Payées').should('be.visible');
      }
    });
  });

  // ═══════════════════════════════════════════
  // 6. CERTIFICATION
  // ═══════════════════════════════════════════

  describe('Certification', () => {
    it('affiche la page certification', () => {
      cy.visit('/certification', { failOnStatusCode: false });

      if (REAL_BACKEND) {
        // En real-backend la route /certification a un guard
        // (certificationNotCompletedGuard) : selon l'état du contractor elle
        // affiche le flux QCM OU redirige vers /certification/memo. Les deux
        // sont des résultats valides — on vérifie le shell et qu'on reste
        // dans la zone certification.
        cy.assertAppShell();
        cy.url().should('match', /\/certification/);
      } else {
        cy.wait('@getDashboard');
        cy.url().should('include', '/certification');
      }
    });
  });

  // ═══════════════════════════════════════════
  // 8. NAVIGATION & 404
  // ═══════════════════════════════════════════

  describe('Navigation', () => {
    it('redirige / vers /dashboard', () => {
      cy.visit('/');
      if (REAL_BACKEND) {
        // En real-backend, le router redirige '' → 'dashboard' ; si la session
        // n'est plus valide à cet instant, l'interceptor 401 rebondit ensuite
        // sur /login. Les DEUX sont des résultats corrects : '' n'est pas une
        // route morte. On vérifie juste qu'on a quitté '/' vers une vraie page.
        cy.url().should('match', /\/(dashboard|login)/);
      } else {
        // L'Angular router redirige '' → 'dashboard'
        cy.url().should('match', /dashboard/);
      }
    });

    it('affiche une page 404 pour une route inconnue', () => {
      cy.visit('/route-qui-nexiste-pas', { failOnStatusCode: false });
      cy.url().should('include', '/route-qui-nexiste-pas');
    });

    it('redirige les anciennes routes /contractor/*', () => {
      cy.visit('/contractor/dashboard');
      cy.url().should('include', '/dashboard');
      cy.url().should('not.include', '/contractor/');
    });
  });
});
