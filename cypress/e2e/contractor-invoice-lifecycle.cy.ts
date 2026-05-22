/// <reference types="cypress" />

/**
 * PARCOURS REEL — Artisan plan gratuit uploade sa facture apres une mission
 *
 * Flow actuel (separation missions / factures) :
 *  1. L'artisan voit ses offres disponibles sur /missions
 *  2. Ouvre le detail d'une intervention (/interventions/:mid) → statut facture
 *  3. Voit "Facture manquante" + bouton "Envoyer ma facture"
 *  4. Clique → redirige vers /invoices avec ref + montant pre-remplis
 *  5. Upload son PDF, clique "Envoyer"
 *  6. La facture est rejetee → il la voit dans /invoices, clique → detail
 *  7. Corrige via le detail facture
 *  8. Facture validee → il la telecharge depuis le detail
 *
 * NB : la route /missions affiche desormais la page « Offres disponibles »
 * (ContractorMissionOffersComponent). Le detail d'une mission realisee avec
 * son statut facturation vit sur /interventions/:mid.
 */

const PAUSE = 3000;

describe('Lifecycle facture — artisan plan gratuit (nouveau flow)', () => {

  it('Etape 1 — Voit la page des offres disponibles', () => {
    cy.mockContractorApi();
    cy.visit('/missions');
    cy.waitApi('@getMissionOffers');

    cy.contains('Offres disponibles').should('be.visible');
    cy.contains('Diagnostic plomb').should('be.visible');
    cy.contains('Lyon').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 2 — Ouvre le detail d\'une intervention → statut facture', () => {
    cy.mockContractorApi();
    cy.visit('/interventions/MIS-2026-043');
    cy.wait('@getMissionDetail');

    // Titre mission
    cy.contains('Diagnostic plomb').should('be.visible');
    cy.contains('CASE-2026-043').should('be.visible');

    // Details
    cy.contains('Lyon').should('be.visible');

    // Section facturation — invoice_status=none → « Facture manquante »
    cy.contains('Facture manquante').should('be.visible');
    cy.contains('Envoyer ma facture').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 3 — Clique "Envoyer ma facture" → redirige vers /invoices', () => {
    cy.mockContractorApi();
    cy.visit('/interventions/MIS-2026-043');
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

    // Formulaire d'upload ouvert automatiquement (query params présents).
    cy.contains('Envoyer une facture').should('be.visible');

    // Le mission-picker est verrouillé (initialRef du query param) : il rend
    // un input readonly « Réf. mission » dont la value porte la référence.
    cy.get('input[readonly]').first().should('have.value', 'CASE-2026-043');

    // Upload le PDF (input fichier du formulaire d'upload facture).
    cy.get('input[type="file"]').first().selectFile(
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
    // Badge accentué « Rejetée » + copy de rejet « Facture illisible »
    // (rejection_reason=low_confidence).
    cy.contains('Rejetée').should('be.visible');
    cy.contains('Facture illisible').should('be.visible');
    // Bouton de correction (actionLabel low_confidence).
    cy.contains('Re-uploader le PDF original').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 6 — Corrige la facture rejetee', () => {
    cy.mockContractorApi({
      dashboard: 'dashboard.json',
      invoices: 'invoices-free-rejected.json',
    });

    cy.visit('/invoices');
    cy.wait('@getInvoices');

    cy.contains('Re-uploader le PDF original').click();
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
    cy.contains('Payée').should('be.visible');

    // Telechargement
    cy.get('.download-btn').first().click();
    cy.wait('@downloadInvoicePdf');

    cy.wait(PAUSE);
  });
});
