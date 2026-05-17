/**
 * Invoice Status Enum
 * Kept for comparison patterns like `if (status === InvoiceStatus.PAID)`
 * For the Invoice/InvoiceItem interfaces, use SDK types (InvoiceResource, InvoiceLineItem).
 */
export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled'
}
