/// <reference types="cypress" />

/**
 * PARCOURS RENOUVELLEMENT â€” Artisan apres 3-6 mois, documents expires
 *
 * Scenario metier :
 *  L'artisan LUCIAN etait 100% conforme. 6 mois plus tard :
 *   - Son KBIS a expire (>3 mois)
 *   - Son attestation URSSAF a expire (>1 mois)
 *   - Il a change de CNI â†’ la nouvelle est en cours de verification
 *   - Son KYC est rejete (nouveau visage sur la CNI = face mismatch)
 *
 *  Il doit :
 *   1. Voir le dashboard degrade (60% au lieu de 100%)
 *   2. Re-uploader le KBIS et l'URSSAF
 *   3. Attendre la verification de la nouvelle CNI
 *   4. Refaire le KYC (rejected â†’ retry)
 *   5. Revenir a 100%
 */

const PAUSE = 3000;

describe('Renouvellement â€” documents expires + nouvelle CNI + KYC a refaire', () => {

  it('Etape 1 â€” Dashboard degrade : 2 documents expires, KYC rejete', () => {
    cy.mockContractorApi({ dashboard: 'dashboard-expired.json' });
    cy.visit('/dashboard');
    cy.wait('@getDashboard');

    // Score degrade
    cy.contains('60% complete').should('be.visible');
    cy.contains('Bienvenue LUCIAN').should('be.visible');

    // Documents : 3 verifies sur 6, 2 expires
    cy.contains('Mes documents').should('be.visible');
    // Le badge montre le ratio
    cy.contains('3/6').should('be.visible');

    // KYC rejete
    cy.contains("Verification d'identite").should('be.visible');
    cy.contains('Refuse').should('be.visible');

    // Certification toujours OK
    cy.contains('Certifie').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 2 â€” Consulte ses documents, voit les expires', () => {
    cy.mockContractorApi({ dashboard: 'dashboard-expired.json' });
    cy.visit('/documents');
    cy.wait('@getDocuments');

    // Les documents sont listes
    cy.contains('kbis_2026.pdf').should('be.visible');
    cy.contains('attestation_urssaf.pdf').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 3 â€” Upload le nouveau KBIS', () => {
    cy.mockContractorApi({ dashboard: 'dashboard-expired.json' });
    cy.visit('/documents/upload');

    // Selectionner le nouveau KBIS
    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 KBIS\nSIRBU LUCIAN BTP\nSIREN: 123456789\nDate: 2026-07-15'),
        fileName: 'kbis_2026_renouvele.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    cy.wait(PAUSE);
  });

  it('Etape 4 â€” Upload la nouvelle attestation URSSAF', () => {
    cy.mockContractorApi({ dashboard: 'dashboard-expired.json' });
    cy.visit('/documents/upload');

    cy.get('input[type="file"]').selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 URSSAF\nSIRBU LUCIAN BTP\nSIRET: 12345678900012\nPeriode: T2 2026\nSituation: a jour'),
        fileName: 'attestation_urssaf_t2_2026.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    cy.wait(PAUSE);
  });

  it('Etape 5 â€” La nouvelle CNI est en cours de verification OCR', () => {
    cy.mockContractorApi({ dashboard: 'dashboard-expired.json' });

    // Override le mock document status pour la CNI
    cy.intercept('GET', '/contractor-compliance/documents/*/status', {
      fixture: 'document-status-cni-pending.json',
    }).as('getDocumentStatus');

    cy.visit('/documents/doc-cni-uuid-002');
    cy.wait('@getDocumentStatus');

    // Statut en cours
    cy.contains('Verification en cours').should('be.visible');
    cy.contains('cni_lucian_sirbu_2026.jpg').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 6 â€” Dashboard mis a jour : documents renouveles, KYC a refaire', () => {
    // Apres renouvellement des docs, score remonte mais KYC toujours rejete
    cy.mockContractorApi({ dashboard: 'dashboard-renewed.json' });
    cy.visit('/dashboard');
    cy.wait('@getDashboard');

    // Score remonte
    cy.contains('85% complete').should('be.visible');

    // Documents presque complets (5/6, CNI en pending)
    cy.contains('5/6').should('be.visible');

    // KYC toujours rejete â€” il faut le refaire avec la nouvelle CNI
    cy.contains('Refuse').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 7 â€” L\'artisan va sur la page KYC pour refaire la verification', () => {
    cy.mockContractorApi({ dashboard: 'dashboard-renewed.json' });
    cy.visit('/kyc');
    cy.wait('@getDashboard');

    // Page KYC chargee
    cy.url().should('include', '/kyc');

    cy.wait(PAUSE);
  });

  it('Etape 8 â€” Retour a 100% apres renouvellement complet', () => {
    // Tout est revalide : docs + CNI + KYC
    cy.mockContractorApi({ dashboard: 'dashboard-100.json' });
    cy.visit('/dashboard');
    cy.wait('@getDashboard');

    // 100% conforme a nouveau
    cy.contains('Votre compte est verifie').should('be.visible');
    cy.contains('Complet').should('be.visible');
    cy.contains('Identite verifiee').should('be.visible');
    cy.contains('Certifie').should('be.visible');

    cy.wait(PAUSE);
  });
});
