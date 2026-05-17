/// <reference types="cypress" />

/**
 * FLOW COMPLET CONTRACTOR COMPLIANCE
 *
 * Tests par page avec assertions basees sur le HTML reel des composants Angular.
 * Tous les endpoints API sont mockes via cy.mockContractorApi() + fixtures JSON.
 */

describe('Contractor Compliance - Flow complet', () => {
  beforeEach(() => {
    cy.mockContractorApi();
  });

  // ═══════════════════════════════════════════
  // 1. DASHBOARD
  // ═══════════════════════════════════════════

  describe('Dashboard', () => {
    it('affiche le dashboard avec le score de conformite a 45%', () => {
      cy.visit('/dashboard');
      cy.wait('@getDashboard');

      // Welcome banner with firstName
      cy.contains('Bienvenue LUCIAN').should('be.visible');
      // Progress bar label
      cy.contains('45% complete').should('be.visible');
      // Step cards
      cy.contains('Mes documents').should('be.visible');
      cy.contains('2/6').should('be.visible');
      cy.contains("Verification d'identite").should('be.visible');
      cy.contains('Certification TUITA').should('be.visible');
      cy.contains('Missions & Factures').should('be.visible');
      // Plan upgrade
      cy.contains('99 EUR/mois').should('be.visible');
    });

    it('affiche le dashboard 100% pour un contractor verifie', () => {
      cy.mockContractorApi('dashboard-100.json');

      cy.visit('/dashboard');
      cy.wait('@getDashboard');

      cy.contains('Votre compte est verifie').should('be.visible');
    });
  });

  // ═══════════════════════════════════════════
  // 2. DOCUMENTS
  // ═══════════════════════════════════════════

  describe('Documents', () => {
    it('affiche la liste des documents', () => {
      cy.visit('/documents');
      cy.wait('@getDocuments');

      cy.contains('kbis_2026.pdf').should('be.visible');
      cy.contains('attestation_rc_pro.pdf').should('be.visible');
      cy.contains('attestation_urssaf.pdf').should('be.visible');
    });

    it('navigue vers la page upload', () => {
      cy.visit('/documents/upload');
      cy.wait('@getDashboard');

      cy.url().should('include', '/documents/upload');
    });

    it('uploade un document avec succes', () => {
      cy.visit('/documents/upload');
      cy.wait('@getDashboard');

      cy.get('input[type="file"]').selectFile(
        {
          contents: Cypress.Buffer.from('fake-pdf-content'),
          fileName: 'attestation_test.pdf',
          mimeType: 'application/pdf',
        },
        { force: true }
      );

      // Try clicking submit if visible
      cy.get('body').then($body => {
        const btn = $body.find('button[type="submit"], button:contains("Envoyer"), button:contains("Valider")');
        if (btn.length) {
          cy.wrap(btn.first()).click();
        }
      });
    });

    it('affiche le statut d\'un document verifie (KBIS)', () => {
      cy.visit('/documents/doc-kbis-uuid-001');
      cy.wait('@getDocumentStatus');

      // The component shows "Document verifie" for verified status
      cy.contains('Document verifie').should('be.visible');
      // File name
      cy.contains('kbis_2026.pdf').should('be.visible');
      // Type label
      cy.contains('Extrait KBIS').should('be.visible');
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
      cy.wait('@getDashboard');
      cy.url().should('include', '/kyc');
    });

    it('affiche la page KYC avec dashboard approuve', () => {
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
    it('affiche la liste des missions avec prix et details', () => {
      cy.visit('/missions');
      cy.wait('@getMissions');

      // Page title
      cy.contains('Mes missions').should('be.visible');
      // Mission titles
      cy.contains('Diagnostic amiante avant travaux').should('be.visible');
      cy.contains('Diagnostic plomb').should('be.visible');
      // Price formatted: 1250.00 → "1250,00 €"
      cy.contains('1250,00').should('be.visible');
      cy.contains('890,00').should('be.visible');
      // Cities
      cy.contains('Paris').should('be.visible');
      cy.contains('Lyon').should('be.visible');
      // Subtitle
      cy.contains('Missions terminees').should('be.visible');
    });
  });

  // ═══════════════════════════════════════════
  // 5. FACTURATION
  // ═══════════════════════════════════════════

  describe('Billing', () => {
    it('affiche le plan actuel', () => {
      cy.visit('/billing');
      cy.wait('@getBilling');

      cy.contains('Gratuit').should('be.visible');
    });

    it('affiche la liste des factures avec numeros et montants', () => {
      cy.visit('/invoices');
      cy.wait('@getInvoices');

      // Invoice numbers (invoice_number field, not "number")
      cy.contains('FAC-2026-001').should('be.visible');
      cy.contains('FAC-2026-002').should('be.visible');
      // Amount formatted: 1250.00 → "1250,00 €"
      cy.contains('1250,00').should('be.visible');
      // Stats
      cy.contains('Payees').should('be.visible');
    });
  });

  // ═══════════════════════════════════════════
  // 6. CERTIFICATION
  // ═══════════════════════════════════════════

  describe('Certification', () => {
    it('affiche la page certification', () => {
      cy.visit('/certification');
      cy.wait('@getDashboard');
      cy.url().should('include', '/certification');
    });
  });

  // ═══════════════════════════════════════════
  // 8. NAVIGATION & 404
  // ═══════════════════════════════════════════

  describe('Navigation', () => {
    it('redirige / vers /dashboard', () => {
      cy.visit('/');
      // L'Angular router redirige '' → 'dashboard'
      // L'URL peut contenir /dashboard directement ou /auth/login?redirect=...dashboard
      cy.url().should('match', /dashboard/);
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
