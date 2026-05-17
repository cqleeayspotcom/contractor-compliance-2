/**
 * KYC Status Enum
 * Kept for comparison patterns like `if (status === KycStatus.APPROVED)`
 * For the Employee/KycSession interfaces, use SDK types (EmployeeResource, KycSessionResource).
 */
export enum KycStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}
