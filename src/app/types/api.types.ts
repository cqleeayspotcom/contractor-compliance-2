/**
 * Types API partages - utilises par plusieurs services
 *
 * NOTE : les types Laravel-legacy (CompanyResource, DocumentResource,
 * EmployeeResource, InvoiceLineItem, InvoiceResource, KycSessionResource,
 * PaginationMeta, PrestataireResource, SubscriptionResource, UserResource)
 * ont ete supprimes apres la regeneration ng-openapi-gen sur le YAML Tuita :
 * le SDK n'expose plus que des `JsonObject` generiques (payloads typeless).
 *
 * Les types locaux ci-dessous restent valables car ils ne dependent pas du SDK.
 */

// ============================================
// Types locaux - non generes par le SDK
// ============================================

/**
 * Entree d'activite / historique
 */
export interface ActivityResource {
  uuid: string;
  action: string;
  description: string;
  status?: string;
  score?: number;
  performed_by?: string;
  created_at: string;
  verified_at?: string;
  entity_type?: 'company' | 'employee' | 'document' | 'prestataire';
  entity_uuid?: string;
}

/**
 * Ressource alerte
 */
export interface AlertResource {
  uuid: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  action_url?: string;
  is_read: boolean;
  created_at: string;
}

/**
 * Reponse d'erreur API standard
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Reponse API generique avec succes
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Metadonnees de pagination (anciennement importees du SDK).
 * Reproduites localement car le SDK regenere ne les expose plus en tant que modele.
 */
export interface PaginationMeta {
  current_page?: number;
  per_page?: number;
  total?: number;
  last_page?: number;
}

/**
 * Reponse API paginee generique
 */
export interface PaginatedApiResponse<T> {
  success: true;
  data: T[];
  meta: PaginationMeta;
}
