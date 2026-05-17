/*
 * Models Module
 * Exports enums (useful for comparison patterns).
 *
 * NOTE : les re-exports de types SDK (UserResource, CompanyResource, etc.)
 * ont ete supprimes apres la regeneration ng-openapi-gen sur le YAML Tuita :
 * le SDK n'expose plus que des `JsonObject` generiques. Les composants qui
 * importaient ces types doivent desormais utiliser `any` ou definir leurs
 * propres interfaces locales.
 */

// Enums
export { UserRole } from './user.model';
export { OwnerType } from './document.model';
export { KycStatus } from './employee.model';
export { InvoiceStatus } from './invoice.model';
export { SubscriptionPlanType, SubscriptionStatusType, SubscriptionPlan, SubscriptionStatus } from './subscription.model';
export { VerificationMethod } from './verification.model';
export type { MissionOffer } from './mission-offer.model';
