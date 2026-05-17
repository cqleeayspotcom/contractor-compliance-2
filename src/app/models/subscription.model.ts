/**
 * Subscription Enums
 * Kept for comparison patterns like `if (plan === SubscriptionPlanType.PRO)`
 * For the Subscription interface, use `SubscriptionResource` from the SDK.
 */

/**
 * Subscription Plan Enum
 */
export enum SubscriptionPlanType {
  FREE = 'free',
  PRO = 'pro'
}

/**
 * Subscription Status Enum
 */
export enum SubscriptionStatusType {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled',
  TRIALING = 'trialing',
  INCOMPLETE = 'incomplete'
}

// Re-export for convenience with legacy names
export const SubscriptionPlan = SubscriptionPlanType;
export const SubscriptionStatus = SubscriptionStatusType;
