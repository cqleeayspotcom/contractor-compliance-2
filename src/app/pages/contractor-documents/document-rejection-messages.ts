/**
 * Mapping des codes de rejet d'un document administratif (backend)
 * → messages user-friendly affichables dans le portail contractor.
 *
 * Source des codes : backend/app/Services/Ocr/OcrDocumentRules.php +
 * backend/app/Listeners/ProcessOcrResult + jobs URSSAF + KYC rematch.
 *
 * Principe : un rejet de document est une action corrective concrète
 * pour l'artisan (réuploader, racheter, récupérer une version à jour...).
 * Le message doit dire EXACTEMENT quoi faire, sans jargon technique.
 *
 * @see backend/app/Services/Ocr/OcrDocumentRules.php
 * @see frontend/src/app/pages/contractor-billing/invoice-rejection-messages.ts
 */

export interface DocumentRejectionCopy {
  /** Titre court affiché en tête de bloc rejet (h3/h4). */
  title: string;
  /** Explication 1-2 phrases du pourquoi, orientée action (quoi corriger). */
  description: string;
  /** Action concrète suggérée (bouton principal). */
  actionLabel: string;
}

/**
 * Copy complète par code de rejet. Tous les messages sont en FR,
 * pensés pour un artisan du BTP (pas de jargon technique).
 */
const REJECTION_COPY: Record<string, DocumentRejectionCopy> = {
  ocr_low_confidence: {
    title: 'Document illisible',
    description:
      "Le document est trop flou pour être lu. Déposez le PDF original téléchargé depuis le site officiel (urssaf.fr, inpi.fr, votre banque). Pas de photo d'écran, pas de capture, pas de scan flou.",
    actionLabel: 'Réuploader le PDF original',
  },

  document_type_mismatch: {
    title: 'Mauvais type de document',
    description:
      "Le document déposé ne correspond pas au type demandé (ex : un RIB à la place d'un KBIS). Choisissez le bon type et redéposez le bon document.",
    actionLabel: 'Corriger',
  },

  document_type_unknown: {
    title: 'Type non reconnu',
    description:
      "Impossible d'identifier ce document. C'est souvent une capture d'écran ou une photo d'écran. Déposez le PDF officiel téléchargé depuis le site de l'organisme.",
    actionLabel: 'Réuploader le PDF officiel',
  },

  statuts_unreadable: {
    title: 'Statuts illisibles',
    description:
      "Les statuts de votre société ne sont pas lisibles. Déposez le PDF original signé remis par votre notaire ou comptable. Pas de photocopie, pas de photo téléphone.",
    actionLabel: 'Réuploader le PDF original',
  },

  urssaf_too_old: {
    title: 'URSSAF trop ancienne',
    description:
      "Votre attestation a plus de 6 mois (durée légale dépassée). Téléchargez la dernière sur urssaf.fr et redéposez-la.",
    actionLabel: 'Télécharger sur urssaf.fr',
  },

  // ─────────────────────────────────────────────────────────────────────
  // URSSAF — API Entreprise (codes actifs depuis 2026-04-22)
  // ─────────────────────────────────────────────────────────────────────

  urssaf_not_up_to_date: {
    title: 'Cotisations URSSAF non à jour',
    description:
      "L'URSSAF indique que vos cotisations ne sont pas à jour. Régularisez sur urssaf.fr, puis téléchargez une nouvelle attestation et redéposez-la.",
    actionLabel: 'Régulariser sur urssaf.fr',
  },

  urssaf_siren_not_found: {
    title: 'SIREN inconnu',
    description:
      "L'URSSAF ne reconnaît pas votre SIREN. Vérifiez-le sur votre attestation et redéposez le bon document.",
    actionLabel: 'Réuploader',
  },

  urssaf_siren_missing: {
    title: 'SIREN illisible',
    description:
      "On ne lit pas votre SIREN sur l'attestation. Redéposez un PDF complet et lisible (pas tronqué, pas flou).",
    actionLabel: 'Réuploader',
  },

  urssaf_verification_unavailable: {
    title: 'Vérification URSSAF indisponible',
    description:
      'Le service URSSAF est momentanément en panne. Réessayez dans quelques minutes.',
    actionLabel: 'Réessayer plus tard',
  },

  // ─────────────────────────────────────────────────────────────────────
  // URSSAF — API AVCS (anti-falsification via code sécurité 15 car.)
  // ─────────────────────────────────────────────────────────────────────

  urssaf_not_authentic: {
    title: 'Attestation non authentifiée',
    description:
      "L'URSSAF ne reconnaît pas le code de sécurité imprimé sur votre attestation. Téléchargez une attestation neuve depuis urssaf.fr et redéposez-la sans la modifier.",
    actionLabel: 'Recommencer',
  },

  urssaf_authenticity_check_unavailable: {
    title: 'Vérification URSSAF indisponible',
    description:
      'Le service URSSAF est momentanément en panne. Réessayez dans quelques minutes.',
    actionLabel: 'Réessayer',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Filtre secteur BTP (code APE)
  // ─────────────────────────────────────────────────────────────────────

  company_out_of_sector: {
    title: 'Hors secteur BTP',
    description:
      "Votre activité officielle n'est pas dans le BTP. Tuita est réservée aux artisans du bâtiment.",
    actionLabel: 'Compris',
  },

  rib_missing_holder: {
    title: 'Nom du titulaire absent',
    description:
      "Le nom du titulaire du compte n'apparaît pas. Téléchargez le RIB officiel depuis votre application bancaire (PDF). N'envoyez jamais de capture d'écran de SMS, WhatsApp ou email avec un IBAN - pour votre sécurité.",
    actionLabel: 'Réuploader le RIB de la banque',
  },

  rib_missing_iban: {
    title: 'IBAN manquant',
    description:
      "Aucun IBAN détecté. Téléchargez le RIB officiel (PDF) depuis votre application bancaire. Pas de capture d'écran de SMS, WhatsApp, email ou note manuscrite - pour votre sécurité.",
    actionLabel: 'Réuploader le RIB de la banque',
  },

  rib_invalid_iban: {
    title: 'IBAN invalide',
    description:
      "L'IBAN lu n'est pas un IBAN français valide (chiffres coupés ou flous). Téléchargez votre RIB officiel en PDF depuis votre application bancaire.",
    actionLabel: 'Réuploader le RIB de la banque',
  },

  certification_missing_expiry: {
    title: 'Date de validité illisible',
    description:
      "On ne lit pas la date de fin de validité. Redéposez le PDF officiel complet (pages entières, non rognées).",
    actionLabel: 'Réuploader',
  },

  kbis_not_original: {
    title: "Justificatif non original",
    description:
      "Seul un document officiel est accepté. Pas de copie scannée, pas de photo d'écran, pas de capture d'email. Récupérez votre justificatif officiel en 1 clic - {price}, livré validé.",
    actionLabel: 'Récupérer mon justificatif officiel',
  },

  // P2-3 (2026-05-12) — Extrait daté de plus de 3 mois. Le seuil est
  // configurable via le setting `compliance.kbis_max_age_months`.
  kbis_too_old: {
    title: 'Justificatif trop ancien',
    description:
      "Votre extrait date de plus de 3 mois - il n'est plus accepté pour rester conforme aux exigences administratives BTP. Récupérez votre extrait INPI à jour en 1 clic - {price}, livré validé.",
    actionLabel: 'Récupérer mon justificatif à jour',
  },

  // P2-6 (2026-05-12) — Le contractor a uploadé une « Déclaration de
  // modification RCS » (acte historique intermédiaire émis lors d'un
  // changement dans la société) au lieu d'un extrait d'immatriculation
  // courant. C'est un cas de confusion contractor récurrent (papier
  // « officiel » qu'il a dans son classeur depuis le dernier changement).
  rcs_modification_not_extract: {
    title: 'Acte modificatif, pas un extrait à jour',
    description:
      "Ce document est une déclaration de modification RCS (acte historique lié à un changement dans votre société), pas un extrait d'immatriculation à jour. Récupérez votre Extrait INPI officiel en 1 clic - {price}, il prouve que votre société est active aujourd'hui.",
    actionLabel: 'Récupérer mon justificatif à jour',
  },

  avis_sirene_invalid: {
    title: "Justificatif invalide",
    description:
      "Document non exploitable (souvent une capture d'écran ou un document tronqué). Récupérez votre justificatif officiel en 1 clic - {price}, livré validé.",
    actionLabel: 'Récupérer mon justificatif officiel',
  },

  // ─────────────────────────────────────────────────────────────────────
  // Lookup existence entreprise (KBIS / URSSAF / Avis SIRENE)
  // ─────────────────────────────────────────────────────────────────────

  company_not_found: {
    title: 'Entreprise introuvable',
    description:
      "Le SIREN du document n'existe pas dans le registre officiel. Vérifiez votre SIREN et redéposez un original lisible.",
    actionLabel: 'Réuploader',
  },

  company_closed: {
    title: 'Entreprise radiée',
    description:
      "L'entreprise est radiée ou cessée selon le registre officiel. Impossible d'accepter ce document.",
    actionLabel: 'Compris',
  },

  company_name_mismatch: {
    title: "Nom d'entreprise différent",
    description:
      "Le nom sur le document ne correspond pas à celui de votre compte. Redéposez un document au bon nom.",
    actionLabel: 'Réuploader',
  },

  company_verification_unavailable: {
    title: 'Vérification entreprise indisponible',
    description:
      "Le registre officiel est momentanément en panne. Réessayez dans quelques minutes.",
    actionLabel: 'Réessayer plus tard',
  },

  ocr_failed: {
    title: 'Analyse indisponible',
    description:
      "Notre service d'analyse est momentanément en panne. Réessayez dans quelques minutes.",
    actionLabel: 'Réessayer',
  },

  face_not_detected: {
    title: 'Visage non détecté',
    description:
      "Aucun visage trouvé sur la pièce d'identité. Posez la pièce à plat sur une table, bonne lumière, sans reflet. Ne photographiez pas un écran (France Identité, autre téléphone) et pas de capture d'écran.",
    actionLabel: 'Reprendre la photo du recto',
  },
};

/**
 * Récupère la copy user-friendly pour un code de rejet backend.
 * Retourne `null` si le code est inconnu (nouveau code pas encore reflété
 * ici) — le composant peut afficher `failure_detail` brut en fallback
 * plutôt qu'un message générique trompeur.
 */
export function rejectionMessage(
  code: string | null | undefined,
  priceLabel = '9,99 €',
): DocumentRejectionCopy | null {
  if (!code) {
    return null;
  }
  const copy = REJECTION_COPY[code];
  if (!copy) {
    return null;
  }
  return {
    ...copy,
    description: copy.description.replace(/\{price\}/g, priceLabel),
  };
}
