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

    // Header dashboard.
    cy.contains('Bonjour LUCIAN').should('be.visible');

    // next_action=renew_expired_documents → bandeau maintenance « Renouvelle
    // tes documents expirés ».
    cy.contains('Renouvelle tes documents expirés').should('be.visible');

    // 2 documents expirés → bandeau alerte rouge sur la home.
    cy.contains('2 documents ont expiré').should('be.visible');

    // Tuile « Mes chantiers » toujours présente.
    cy.contains('Mes chantiers').should('be.visible');

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

    // Fermer la modale vidéo du stepper, puis ouvrir la zone de dépôt de
    // l'étape courante (clic variante CNI si l'étape est « identité »).
    cy.dismissStepperVideo();
    cy.openStepperUploadZone();

    // Selectionner le nouveau document
    cy.get('input[type="file"]', { timeout: 15000 }).last().selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 KBIS\nSIRBU LUCIAN BTP\nSIREN: 123456789\nDate: 2026-07-15'),
        fileName: 'kbis_2026_renouvele.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    cy.wait('@uploadDocument');
    cy.wait(PAUSE);
  });

  it('Etape 4 â€” Upload la nouvelle attestation URSSAF', () => {
    cy.mockContractorApi({ dashboard: 'dashboard-expired.json' });
    cy.visit('/documents/upload');
    cy.dismissStepperVideo();
    cy.openStepperUploadZone();

    cy.get('input[type="file"]', { timeout: 15000 }).last().selectFile(
      {
        contents: Cypress.Buffer.from('%PDF-1.4 URSSAF\nSIRBU LUCIAN BTP\nSIRET: 12345678900012\nPeriode: T2 2026\nSituation: a jour'),
        fileName: 'attestation_urssaf_t2_2026.pdf',
        mimeType: 'application/pdf',
      },
      { force: true }
    );

    cy.wait('@uploadDocument');
    cy.wait(PAUSE);
  });

  it('Etape 5 â€” La nouvelle CNI est en cours de verification OCR', () => {
    cy.mockContractorApi({ dashboard: 'dashboard-expired.json' });

    // Override le mock document status pour la CNI. Route SDK = GET
    // /documents/{uuid} (documentsGet.PATH), pas /documents/{uuid}/status.
    cy.intercept('GET', '/contractor-compliance/documents/*', {
      fixture: 'document-status-cni-pending.json',
    }).as('getDocumentStatus');

    cy.visit('/documents/doc-cni-uuid-002');
    cy.wait('@getDocumentStatus');

    // Statut en cours — libellé accentué « Vérification en cours ».
    cy.contains('Vérification en cours').should('be.visible');
    cy.contains('cni_lucian_sirbu_2026.jpg').should('be.visible');

    cy.wait(PAUSE);
  });

  it('Etape 6 â€” Dashboard mis a jour : documents renouveles, KYC a refaire', () => {
    // Apres renouvellement des docs, score remonte mais KYC toujours rejete
    cy.mockContractorApi({ dashboard: 'dashboard-renewed.json' });
    cy.visit('/dashboard');
    cy.wait('@getDashboard');

    cy.contains('Bonjour LUCIAN').should('be.visible');

    // next_action=retry_kyc → bandeau maintenance « Refais ta vérification
    // d'identité ».
    cy.contains('Refais ta vérification d\'identité').should('be.visible');

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

    // 100% conforme à nouveau : tuiles « Conforme », plus de bandeau alerte.
    cy.contains('Bonjour LUCIAN').should('be.visible');
    cy.contains('Mes chantiers').should('be.visible');
    cy.contains('Conforme').should('be.visible');

    cy.wait(PAUSE);
  });
});
