/**
 * Verification Method Enum
 * Kept for comparison patterns like `if (method === VerificationMethod.OCR)`
 * For the Verification interface, use the SDK or DocumentService types.
 */
export enum VerificationMethod {
  OCR = 'ocr',
  API = 'api',
  QR = 'qr',
  MANUAL = 'manual'
}
