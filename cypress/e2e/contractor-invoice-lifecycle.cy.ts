/// <reference types="cypress" />

/**
 * PARCOURS REEL — Artisan plan gratuit uploade sa facture apres une mission
 *
 * Nouveau flow (separation missions / factures) :
 *  1. L'artisan voit ses missions terminees (cartes cliquables, badges statut)
 *  2. Clique sur la mission → page detail mission
 *  3. Voit "Facture manquante" + bouton "Envoyer ma facture"
 *  4. Clique → redirige vers /invoices avec ref + montant pre-remplis
 *  5. Upload son PDF, clique "Envoyer"
 *  6. La facture est rejetee → il la voit dans /invoices, clique → detail
 *  7. Corrige via le detail facture
 *  8. Facture validee → il la telecharge depuis le detail
 */

const PAUSE = 3000;

describe('Lifecycle facture — artisan plan gratuit (nouveau flow)', () => {

  it('Etape 1 — Voit la liste des missions (cartes cliquables)', () => {
    cy.mockContractorApi();
    cy.visit('/missions');
    cy.wait('@getMissions');

    cy.contains('Mes missions').should('be.visible');
    cy.contains('Missions terminees').should('be.visible');
    cy.contains('Diagnostic plomb').should('be.visible');
    cy.contains('Lyon').should('be.visible');
    cy.contains('890,00').should('be.visible');
    // Pas de bouton upload sur la liste — juste des cartes
    cy.contains('Uploader ma facture').should('not.exist');

    cy.wait(PAUSE);
  });

  it('Etape 2 — Clique sur une mission → detail avec statut facture', () => {
    cy.mockContractorApi();
    cy.visit('/missions/MIS-2026-043');
    cy.wait('@getMissionDetail');

    // Titre mission
    cy.contains('Diagnostic plomb').should('be.visible');
    cy.contains('CASE-2026-043').should('be.visible');

    // Details
    cy.contains('Lyon').should('be.visible');
    cy.contains('890,00').should('be.visible');

    // Section facturation — facture manquante
    cy.contains('Facture manquante').should('be.visible');
    cy.contains('Envoyer ma facture').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 3 — Clique "Envoyer ma facture" → redirige vers /invoices', () => {
    cy.mockContractorApi();
    cy.visit('/missions/MIS-2026-043');
    cy.wait('@getMissionDetail');

    cy.contains('Envoyer ma facture').click();

    // Redirige vers /invoices avec les query params
    cy.url().should('include', '/invoices');
    cy.url().should('include', 'mission_ref=CASE-2026-043');
    cy.url().should('include', 'amount=890');

    cy.wait(PAUSE);
  });

  it('Etape 4 — Formulaire pre-rempli, upload le PDF et envoie', () => {
    cy.mockContractorApi();
    cy.visit('/invoices?mission_ref=CASE-2026-043&amount=890&mid=MIS-2026-043');
    cy.wait('@getInvoices');

    // Formulaire ouvert automatiquement
    cy.contains('Envoyer une facture').should('be.visible');

    // Champs pre-remplis
    cy.get('input[matinput]').eq(0).should('have.value', 'CASE-2026-043');
    cy.get('input[matinput]').eq(1).should('have.value', '890');

    // Upload le PDF
    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 FACTURE\nDiagnostic plomb Lyon\nMontant TTC: 890,00 EUR'),
        fileName: 'facture_diagnostic_plomb.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );
    cy.contains('facture_diagnostic_plomb.pdf').should('be.visible');
    cy.contains('button', 'Envoyer').click();
    cy.wait('@uploadInvoice');

    cy.wait(PAUSE);
  });

  it('Etape 5 — La facture est rejetee, visible dans la liste', () => {
    cy.mockContractorApi({
      dashboard: 'dashboard.json',
      invoices: 'invoices-free-rejected.json',
    });

    cy.visit('/invoices');
    cy.wait('@getInvoices');

    cy.contains('FAC-2026-M002').should('be.visible');
    cy.contains('Rejetee').should('be.visible');
    cy.contains('Verification echouee').should('be.visible');
    cy.contains('Corriger').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 6 — Corrige la facture rejetee', () => {
    cy.mockContractorApi({
      dashboard: 'dashboard.json',
      invoices: 'invoices-free-rejected.json',
    });

    cy.visit('/invoices');
    cy.wait('@getInvoices');

    cy.contains('Corriger').click();
    cy.contains('Corriger la facture').should('be.visible');

    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 FACTURE CORRIGEE'),
        fileName: 'facture_corrigee.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );
    cy.contains('Soumettre la correction').click();
    cy.wait('@reuploadInvoice');

    cy.wait(PAUSE);
  });

  it('Etape 7 — Facture validee, telechargement depuis la liste', () => {
    cy.mockContractorApi({
      dashboard: 'dashboard.json',
      invoices: 'invoices.json',
    });

    cy.visit('/invoices');
    cy.wait('@getInvoices');

    cy.contains('FAC-2026-001').should('be.visible');
    cy.contains('Payee').should('be.visible');

    // Telechargement
    cy.get('.download-btn').first().click();
    cy.wait('@downloadInvoicePdf');

    cy.wait(PAUSE);
  });
});
