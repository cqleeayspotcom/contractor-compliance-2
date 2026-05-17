/**
 * User Role Enum
 * Kept for comparison patterns like `if (role === UserRole.ADMIN)`
 * For the User interface, use `UserResource` from the SDK.
 */
export enum UserRole {
  ADMIN = 'admin',
  COMPANY = 'company',
  EMPLOYEE = 'employee',
  PRESTATAIRE = 'prestataire'
}
