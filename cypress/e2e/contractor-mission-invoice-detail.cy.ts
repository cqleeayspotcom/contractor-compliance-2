/// <reference types="cypress" />

/**
 * PAGES DETAIL â€” Mission detail + Facture detail
 *
 * Nouveaux flows avec la separation missions/factures :
 *  - /missions/:mid â€” detail mission + section facturation
 *  - /invoices/:uuid â€” detail facture + lien vers mission associee
 */

const PAUSE = 3000;

describe('Pages detail â€” missions et factures', () => {

  beforeEach(() => {
    cy.mockContractorApi();
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MISSION DETAIL
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Detail mission (/missions/:mid)', () => {

    it('affiche toutes les infos de la mission', () => {
      cy.visit('/missions/MIS-2026-043');
      cy.wait('@getMissionDetail');

      // Titre + ref
      cy.contains('Diagnostic plomb').should('be.visible');
      cy.contains('CASE-2026-043').should('be.visible');

      // Lieu
      cy.contains('Lyon').should('be.visible');
      cy.contains('5 avenue des Champs').should('be.visible');

      // Montant
      cy.contains('890,00').should('be.visible');

      // Section facturation
      cy.contains('Facture manquante').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche le bouton "Envoyer ma facture" si facture manquante', () => {
      cy.visit('/missions/MIS-2026-043');
      cy.wait('@getMissionDetail');

      cy.contains('Envoyer ma facture').should('be.visible');

      cy.wait(PAUSE);
    });

    it('le bouton redirige vers /invoices avec les query params', () => {
      cy.visit('/missions/MIS-2026-043');
      cy.wait('@getMissionDetail');

      cy.contains('Envoyer ma facture').click();

      cy.url().should('include', '/invoices');
      cy.url().should('include', 'mission_ref=CASE-2026-043');
      cy.url().should('include', 'amount=890');
      cy.url().should('include', 'mid=MIS-2026-043');

      cy.wait(PAUSE);
    });

    it('mission avec facture envoyee â€” pas de bouton upload', () => {
      // Mock une mission deja facturee
      cy.intercept('GET', '/contractor-compliance/missions/*', {
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

      cy.visit('/missions/MIS-2026-042');
      cy.wait('@getMissionFacturee');

      cy.contains('Diagnostic amiante avant travaux').should('be.visible');
      cy.contains('Facture envoyee').should('be.visible');
      cy.contains('Envoyer ma facture').should('not.exist');

      cy.wait(PAUSE);
    });

    it('mission avec facture rejetee â€” bouton "Corriger la facture"', () => {
      cy.intercept('GET', '/contractor-compliance/missions/*', {
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

      cy.visit('/missions/MIS-2026-043');
      cy.wait('@getMissionRejetee');

      cy.contains('Facture rejetee').should('be.visible');
      cy.contains('Corriger la facture').should('be.visible');

      cy.wait(PAUSE);
    });

    it('navigation retour vers /missions', () => {
      cy.visit('/missions/MIS-2026-043');
      cy.wait('@getMissionDetail');

      // Le bouton retour (icone arrow_back) existe
      cy.get('mat-icon').contains('arrow_back').should('exist');

      cy.wait(PAUSE);
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // FACTURE DETAIL
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Detail facture (/invoices/:uuid)', () => {

    it('affiche les details complets d\'une facture payee', () => {
      // Mock la liste des invoices (le detail fetch depuis la liste)
      cy.visit('/invoices/inv-uuid-001');
      cy.wait('@getInvoices');

      // Invoice number
      cy.contains('FAC-2026-001').should('be.visible');
      // Montant
      cy.contains('1250,00').should('be.visible');
      // Statut
      cy.contains('Payee').should('be.visible');

      cy.wait(PAUSE);
    });

    it('affiche le contexte mission avec lien cliquable', () => {
      cy.visit('/invoices/inv-uuid-001');
      cy.wait('@getInvoices');

      // Mission associee
      cy.contains('Diagnostic amiante avant travaux').should('be.visible');
      cy.contains('Paris').should('be.visible');

      cy.wait(PAUSE);
    });

    it('bouton "Telecharger le PDF" sur une facture non rejetee', () => {
      cy.visit('/invoices/inv-uuid-001');
      cy.wait('@getInvoices');

      cy.contains('Telecharger').should('be.visible');

      cy.wait(PAUSE);
    });

    it('facture rejetee affiche bouton de re-upload', () => {
      cy.mockContractorApi({
        invoices: 'invoices-free-rejected.json',
      });

      cy.visit('/invoices/inv-manual-002');
      cy.wait('@getInvoices');

      cy.contains('Rejetee').should('be.visible');
      // Le bouton de correction â€” label exact vient de invoice-rejection-messages.ts
      cy.contains('Re-uploader').should('be.visible');

      cy.wait(PAUSE);
    });

    it('navigation retour vers /invoices', () => {
      cy.visit('/invoices/inv-uuid-001');
      cy.wait('@getInvoices');

      // Le bouton retour (icone arrow_back) existe
      cy.get('mat-icon').contains('arrow_back').should('exist');

      cy.wait(PAUSE);
    });
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // NAVIGATION HEADER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  describe('Header â€” nouvelles icones navigation', () => {

    it('le header a les icones Missions, Factures, Compliance', () => {
      cy.visit('/dashboard');
      cy.wait('@getDashboard');

      // Les icones de navigation sont presentes
      cy.get('mat-icon').contains('assignment').should('exist');   // Missions
      cy.get('mat-icon').contains('receipt_long').should('exist'); // Factures
      cy.get('mat-icon').contains('verified_user').should('exist'); // Compliance

      cy.wait(PAUSE);
    });
  });
});
