/// <reference types="cypress" />

/**
 * PAGES DETAIL — Mission detail + Facture detail
 *
 * Spec « convertible direct » (cf. WS3-CYPRESS.md).
 *  - mode mock (défaut)  : détails mission/facture sur fixtures figées
 *    (uuid précis MIS-2026-043, inv-uuid-001…).
 *  - mode real-backend   : CYPRESS_realBackend=1 → auth réelle + backend :8060.
 *    Les pages DÉTAIL d'une mission/facture précise dépendent d'uuids de
 *    fixture qui n'existent pas en base → en real-backend on vérifie plutôt
 *    que les pages LISTE (missions, factures) et la navigation header se
 *    rendent. Les tests de détail figé restent couverts en mode mock.
 */

import { REAL_BACKEND } from '../support/commands';

const PAUSE = REAL_BACKEND ? 200 : 3000;

// Téléphone FACTICE du contractor de test (06 00 00 00 99).
const FAKE_PHONE = 'P33600000099';

describe('Pages detail — missions et factures', () => {

  beforeEach(() => {
    if (REAL_BACKEND) {
      cy.loginContractor(FAKE_PHONE);
    }
    cy.mockContractorApi();
  });

  // ═══════════════════════════════════════════
  // MISSION DETAIL
  // ═══════════════════════════════════════════

  // Le détail d'une mission réalisée (avec son statut de facturation) vit
  // sur /interventions/:mid (ContractorInterventionDetailComponent). La route
  // /missions/:mid affiche désormais le détail d'une OFFRE (sans facture).
  describe('Detail intervention (/interventions/:mid)', () => {

    it('affiche toutes les infos de la mission', function () {
      // Détail d'une mission précise = fixture figée (MIS-2026-043).
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.visit('/interventions/MIS-2026-043');
      cy.wait('@getMissionDetail');

      cy.contains('Diagnostic plomb').should('be.visible');
      cy.contains('CASE-2026-043').should('be.visible');
      cy.contains('Lyon').should('be.visible');
      cy.contains('5 avenue des Champs').should('be.visible');
      cy.contains('890,00').should('be.visible');
      cy.contains('Facture manquante').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche le bouton "Envoyer ma facture" si facture manquante', function () {
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.visit('/interventions/MIS-2026-043');
      cy.wait('@getMissionDetail');

      cy.contains('Envoyer ma facture').should('be.visible');

      cy.wait(PAUSE);
    });

    it('le bouton redirige vers /invoices avec les query params', function () {
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.visit('/interventions/MIS-2026-043');
      cy.wait('@getMissionDetail');

      cy.contains('Envoyer ma facture').click();

      cy.url().should('include', '/invoices');
      cy.url().should('include', 'mission_ref=CASE-2026-043');
      cy.url().should('include', 'amount=890');
      cy.url().should('include', 'mid=MIS-2026-043');

      cy.wait(PAUSE);
    });

    it('mission avec facture envoyee — pas de bouton upload', function () {
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.intercept('GET', '/contractor-compliance/missions/MIS-*', {
        statusCode: 200,
        body: {
          data: {
            mid: 'MIS-2026-042',
            caseNumber: 'CASE-2026-042',
            missionTitle: 'Diagnostic amiante avant travaux',
            operationType: 'DAAT',
            operationTypeLabel: 'Diagnostic Amiante Avant Travaux',
            price: 1250.00,
            targetAddress: '12 rue de la Paix',
            city: 'Paris',
            visitDateConfirmed: '2026-03-28T09:00:00Z',
            signedAt: '2026-03-28T17:00:00Z',
            canRun: true,
            invoice_status: 'uploaded',
          },
        },
      }).as('getMissionFacturee');

      cy.visit('/interventions/MIS-2026-042');
      cy.wait('@getMissionFacturee');

      cy.contains('Diagnostic amiante avant travaux').should('be.visible');
      // invoice_status=uploaded → libellé accentué « Facture envoyée ».
      cy.contains('Facture envoyée').should('be.visible');
      cy.contains('Envoyer ma facture').should('not.exist');

      cy.wait(PAUSE);
    });

    it('mission avec facture rejetee — bouton "Corriger la facture"', function () {
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.intercept('GET', '/contractor-compliance/missions/MIS-*', {
        statusCode: 200,
        body: {
          data: {
            mid: 'MIS-2026-043',
            caseNumber: 'CASE-2026-043',
            missionTitle: 'Diagnostic plomb',
            operationType: 'DPB',
            operationTypeLabel: 'Diagnostic Plomb',
            price: 890.00,
            targetAddress: '5 avenue des Champs',
            city: 'Lyon',
            visitDateConfirmed: '2026-04-05T14:00:00Z',
            signedAt: '2026-04-05T18:00:00Z',
            canRun: true,
            invoice_status: 'rejected',
          },
        },
      }).as('getMissionRejetee');

      cy.visit('/interventions/MIS-2026-043');
      cy.wait('@getMissionRejetee');

      // invoice_status=rejected → libellé accentué « Facture rejetée ».
      cy.contains('Facture rejetée').should('be.visible');
      cy.contains('Corriger la facture').should('be.visible');

      cy.wait(PAUSE);
    });

    it('la page des offres disponibles est atteignable', () => {
      // Test réel : la page /missions (offres) se rend.
      cy.visit('/missions');
      cy.url().should('include', '/missions');
      if (REAL_BACKEND) {
        cy.assertAppShell();
      } else {
        cy.get('app-root').should('not.be.empty');
      }
      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // FACTURE DETAIL
  // ═══════════════════════════════════════════

  describe('Detail facture (/invoices/:uuid)', () => {

    // NB : ContractorInvoiceDetailComponent n'a pas d'endpoint dédié — il
    // charge la LISTE (/invoices) et filtre par uuid côté client. On attend
    // donc @getInvoices, et la fixture liste doit contenir l'uuid visé.

    it('affiche les details complets d\'une facture payee', function () {
      // Détail d'une facture présente dans la liste (inv-uuid-001 de invoices.json).
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.visit('/invoices/inv-uuid-001');
      cy.wait('@getInvoices');

      cy.contains('FAC-2026-001').should('be.visible');
      cy.contains('1250,00').should('be.visible');
      // Badge accentué « Payée » (statusLabel paid).
      cy.contains('Payée').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche le contexte mission', function () {
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.visit('/invoices/inv-uuid-001');
      cy.wait('@getInvoices');

      cy.contains('Diagnostic amiante avant travaux').should('be.visible');
      cy.contains('Paris').should('be.visible');

      cy.wait(PAUSE);
    });

    it('bouton "Telecharger le PDF" sur une facture non rejetee', function () {
      if (REAL_BACKEND) {
        this.skip();
      }
      cy.visit('/invoices/inv-uuid-001');
      cy.wait('@getInvoices');

      cy.contains('Telecharger le PDF').should('be.visible');

      cy.wait(PAUSE);
    });

    it('facture rejetee affiche bouton de re-upload', function () {
      if (REAL_BACKEND) {
        this.skip();
      }
      // invoices-free-rejected.json contient inv-manual-002 (rejected,
      // rejection_reason=low_confidence) — le détail le retrouve dans la liste.
      cy.mockContractorApi({ invoices: 'invoices-free-rejected.json' });

      cy.visit('/invoices/inv-manual-002');
      cy.wait('@getInvoices');

      // Bloc de rejet : titre « Facture illisible » (low_confidence) +
      // bouton de correction (actionLabel) « Re-uploader le PDF original ».
      cy.contains('Facture illisible').should('be.visible');
      cy.contains('Re-uploader le PDF original').should('be.visible');

      cy.wait(PAUSE);
    });

    it('la page liste des factures est atteignable', () => {
      // Test réel : la page /invoices se rend.
      cy.visit('/invoices');
      cy.waitApi('@getInvoices');
      if (REAL_BACKEND) {
        cy.assertAppShell();
        cy.url().should('include', '/invoices');
      } else {
        cy.contains('FAC-2026-001').should('be.visible');
      }
      cy.wait(PAUSE);
    });
  });

  // ═══════════════════════════════════════════
  // NAVIGATION HEADER
  // ═══════════════════════════════════════════

  describe('Header — icones navigation', () => {

    it('le header a les icones de navigation', () => {
      cy.visit('/dashboard');
      cy.waitApi('@getDashboard');

      if (REAL_BACKEND) {
        // Le header contractor est monté (cf. cy.assertAppShell). Les icônes
        // de nav réelles incluent au moins « assignment » et « verified_user »
        // (constaté sur le header real-backend).
        cy.assertAppShell();
        cy.get('mat-icon').contains('assignment').should('exist');
        cy.get('mat-icon').contains('verified_user').should('exist');
      } else {
        // Icônes de navigation du header (app-header) : assignment, verified_user,
        // person. L'ancienne icône `receipt_long` n'est plus dans le header.
        cy.get('mat-icon').contains('assignment').should('exist');
        cy.get('mat-icon').contains('verified_user').should('exist');
        cy.get('mat-icon').contains('person').should('exist');
      }

      cy.wait(PAUSE);
    });
  });
});
