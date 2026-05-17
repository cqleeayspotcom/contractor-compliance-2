/**
 * Mapping des codes de rejet d'une facture (backend) → messages user-friendly
 * affichables dans le portail contractor.
 *
 * Source des codes : backend/app/Jobs/ValidateInvoiceOcrJob.php →
 *   - `ocr_failed`                    : OCR en erreur technique (Mistral down, etc.)
 *   - `low_confidence`                : confidence OCR < 0.80 après 2 auto-retry
 *   - `validation_failed`             : une des règles métier de OcrDocumentRules::evaluateInvoice
 *                                       a échoué. Le détail est dans `rejection_details[]` (array de strings).
 *   - `amount_mismatch`               : cross-check montant déclaré vs OCR > ±5%
 *   - `mission_amount_mismatch`       : cross-check montant vs prix convenu mission > ±5%
 *   - `invoice_predates_mission`      : facture émise AVANT la fin de la mission
 *   - `invoice_too_many_pages`        : >5 pages (hard limit métier, voir OcrDocumentRules)
 *   - `invoice_recipient_missing`     : destinataire absent du PDF (doit être Tuita SAS)
 *   - `invoice_recipient_not_tuita`   : destinataire présent mais ≠ Tuita SAS (SIRET ou nom différent)
 *   - `invoice_duplicate_number`      : numéro de facture déjà utilisé par ce prestataire (norme FR)
 *   - `invoice_missing_payment_terms` : pas de mention délai de paiement / pénalités (Art. L441-9 CC)
 *   - `invoice_missing_legal_form`    : forme juridique société manquante (SARL/SAS/EURL...)
 *   - `invoice_missing_tva_franchise_mention` : auto-entrepreneur sans la mention art. 293 B CGI
 *   - `invoice_tva_charged_for_micro_entrepreneur` : auto-entrepreneur qui facture de la TVA (incohérent)
 *
 * Règle : TOUJOURS afficher le message correspondant + la liste détaillée
 * `rejection_details` si présente, pour que le contractor sache EXACTEMENT
 * quoi corriger avant de réuploader.
 *
 * @see backend/app/Services/Ocr/OcrDocumentRules.php::evaluateInvoice
 * @see docs/security-attack-scenarios.md
 */

export interface InvoiceRejectionCopy {
  /** Titre court affiché en tête de bloc rejet (h3/h4). */
  title: string;
  /** Explication 1-2 phrases du pourquoi, orientée action (quoi corriger). */
  description: string;
  /** Action concrète suggérée (bouton principal). */
  actionLabel: string;
}

/**
 * Copy complète par code de rejet. Si un code inconnu arrive (ex: nouveau code
 * ajouté côté backend pas encore reflété ici), `fallback()` renvoie un message
 * générique qui n'expose PAS le code technique à l'utilisateur.
 */
const REJECTION_COPY: Record<string, InvoiceRejectionCopy> = {
  ocr_failed: {
    title: 'Lecture indisponible',
    description:
      "Notre service d'analyse est en panne pour quelques minutes. Réessaie dans 5 minutes.",
    actionLabel: 'Re-uploader la facture',
  },

  low_confidence: {
    title: 'Facture illisible',
    description:
      "Ton document est trop flou pour être lu. Dépose le PDF que ton logiciel de facturation (Indy, Henrri, Tiime, Word, Excel...) a généré. Pas une photo prise au téléphone, pas une capture d'écran, pas une photo d'un autre écran.",
    actionLabel: 'Re-uploader le PDF original',
  },

  validation_failed: {
    title: 'Mentions obligatoires manquantes',
    description:
      "Il manque une ou plusieurs mentions obligatoires sur ta facture (voir le détail juste en dessous). Corrige-les dans ton logiciel et renvoie.",
    actionLabel: 'Re-uploader après correction',
  },

  amount_mismatch: {
    title: 'Montant saisi ≠ montant du PDF',
    description:
      "Le montant TTC que tu as saisi à l'upload ne correspond pas à celui imprimé sur la facture. Vérifie les deux et corrige celui qui est faux.",
    actionLabel: 'Re-uploader avec le bon montant',
  },

  mission_amount_mismatch: {
    title: 'Montant différent du prix convenu',
    description:
      "Le montant de la facture s'écarte de plus de 5 % du prix convenu avec le donneur d'ordre. Si tu as facturé en plus (travaux supplémentaires demandés sur place), appelle le donneur d'ordre pour qu'il mette à jour son bon de commande avant que tu ne renvoies.",
    actionLabel: 'Re-uploader après ajustement',
  },

  invoice_predates_mission: {
    title: 'Date trop ancienne',
    description:
      "Ta facture est datée AVANT la fin du chantier. Une facture ne s'émet qu'une fois le travail terminé. Refais-la avec une date d'aujourd'hui (ou postérieure à la fin du chantier).",
    actionLabel: 'Re-uploader avec une date correcte',
  },

  invoice_too_many_pages: {
    title: 'Trop de pages',
    description:
      "Ton PDF fait plus de 5 pages. Une facture tient en 1 à 5 pages. Si tu as joint un devis ou un bon d'intervention dans le même fichier, sépare-les et n'envoie que la facture ici.",
    actionLabel: 'Re-uploader la facture seule',
  },

  invoice_recipient_missing: {
    title: 'Destinataire absent',
    description:
      "Ta facture doit être adressée à « Tuita SAS ». Ajoute-nous comme destinataire dans ton logiciel et renvoie.",
    actionLabel: 'Réessayer',
  },

  invoice_recipient_not_tuita: {
    title: 'Mauvais destinataire',
    description:
      "Adresse ta facture à « Tuita SAS » (c'est nous qui te payons, pas le donneur d'ordre). Change le destinataire et renvoie.",
    actionLabel: 'Modifier ma facture',
  },

  invoice_duplicate_number: {
    title: 'Numéro de facture déjà utilisé',
    description:
      "Tu as déjà envoyé une facture avec ce numéro (qu'elle soit acceptée ou rejetée). La loi interdit de réutiliser un numéro. Émets une nouvelle facture avec le numéro suivant dans ta séquence.",
    actionLabel: 'Ré-émettre avec un nouveau numéro',
  },

  invoice_missing_payment_terms: {
    title: 'Délai de paiement manquant',
    description:
      "Il manque le délai de paiement sur ta facture (la loi l'exige). Recopie cette ligne mot pour mot - ça suffit : « Paiement à 30 jours - Pénalités de retard : 3× le taux légal - Indemnité forfaitaire 40 € ».",
    actionLabel: 'Ajouter la mention et re-uploader',
  },

  invoice_missing_legal_form: {
    title: 'Forme de société manquante',
    description:
      "Ta facture doit afficher la forme de ta société à côté de son nom. Si tu es en SARL, écris « Mon entreprise SARL ». Pareil pour SAS, EURL, SASU. C'est obligatoire pour les sociétés.",
    actionLabel: 'Ajouter la forme de société',
  },

  invoice_missing_tva_franchise_mention: {
    title: 'Mention TVA manquante',
    description:
      "Tu es auto-entrepreneur, donc tu ne factures pas de TVA. Mais la loi demande que tu recopies cette phrase mot pour mot sur ta facture : « TVA non applicable, art. 293 B du CGI ».",
    actionLabel: 'Ajouter la mention sur ma facture',
  },

  invoice_tva_charged_for_micro_entrepreneur: {
    title: 'TVA mise sur ta facture par erreur',
    description:
      "Tu es auto-entrepreneur : tu ne dois PAS mettre de TVA sur tes factures. Refais ta facture sans la ligne TVA, et ajoute cette phrase mot pour mot : « TVA non applicable, art. 293 B du CGI ».",
    actionLabel: 'Refaire ma facture sans TVA',
  },
};

/**
 * Récupère la copy user-friendly pour un code de rejet backend.
 * Si le code est inconnu, renvoie un message générique sans exposer
 * de détail technique.
 */
export function getInvoiceRejectionCopy(code: string | null | undefined): InvoiceRejectionCopy {
  if (!code) {
    return fallback();
  }
  return REJECTION_COPY[code] ?? fallback(code);
}

function fallback(code?: string): InvoiceRejectionCopy {
  return {
    title: 'Facture rejetée',
    description: code
      ? `Ta facture n'a pas passé la vérification (code : ${code}). Regarde le détail juste en dessous, corrige et renvoie.`
      : "Ta facture n'a pas passé la vérification. Regarde le détail juste en dessous, corrige et renvoie.",
    actionLabel: 'Re-uploader',
  };
}
