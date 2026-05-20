# Angular Services Documentation

## Overview

This document provides comprehensive documentation for all services in the Tuita Compliance Angular application.

## Table of Contents

1. [API Services](#api-services)
2. [Business Logic Services](#business-logic-services)
3. [UI Services](#ui-services)
4. [Mock Services](#mock-services)

---

## API Services

### ApiService

**Location**: `src/app/services/api/api.service.ts`

**Purpose**: Base HTTP client for all API communication with the Laravel backend.

**Key Features**:
- Automatic JWT token injection
- Request/response interceptors
- Error handling and user-friendly messages
- File upload/download support
- Pagination support
- Timeout handling

**Usage Example**:

```typescript
import { ApiService } from '../../services/api/api.service';

@Component({
  // ...
})
export class MyComponent {
  private api = inject(ApiService);

  loadData() {
    this.api.get<DataType>('endpoint').subscribe({
      next: (data) => console.log(data),
      error: (error) => console.error(error)
    });
  }
}
```

**Key Methods**:

- `get<T>(endpoint, params?)`: GET request
- `getPaginated<T>(endpoint, params?)`: Paginated GET request
- `post<T>(endpoint, data)`: POST request
- `postFormData<T>(endpoint, formData)`: POST with multipart/form-data
- `put<T>(endpoint, data)`: PUT request
- `patch<T>(endpoint, data)`: PATCH request
- `delete<T>(endpoint)`: DELETE request
- `downloadFile(endpoint, filename)`: Download file as blob
- `uploadFile<T>(endpoint, file, additionalData?)`: Upload single file
- `uploadFiles<T>(endpoint, files, additionalData?)`: Upload multiple files

**Response Types**:

```typescript
interface ApiResponse<T> {
  data: T;
  message?: string;
  errors?: Record<string, string[]>;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    // ... other pagination info
  };
}
```

---

## Business Logic Services

### AuthService

**Location**: `src/app/services/auth/auth.service.ts`

**Purpose**: Handles authentication, authorization, and user session management.

**Key Features**:
- Login/logout functionality
- JWT token management
- Token refresh mechanism
- User profile management
- Role-based access control
- Session timeout warnings

**Usage Example**:

```typescript
import { AuthService } from '../../services/auth/auth.service';

@Component({
  // ...
})
export class LoginComponent {
  private authService = inject(AuthService);

  login(credentials: LoginCredentials) {
    this.authService.login(credentials).subscribe({
      next: (response) => {
        // Auto-redirect handled by auth guard
      },
      error: (error) => {
        // Show error message
      }
    });
  }
}
```

**Key Methods**:

- `login(credentials)`: Authenticate user
- `logout()`: End user session
- `refreshToken()`: Refresh JWT token
- `init()`: Initialize auth state on app load
- `getCurrentUser()`: Get current user profile
- `updateProfile(data)`: Update user profile
- `changePassword(data)`: Change user password
- `hasRole(role)`: Check if user has role
- `hasPermission(permission)`: Check if user has permission

**Auth State**:

```typescript
interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  roles: UserRole[];
}
```

---

### InvoiceService

**Location**: `src/app/services/invoice.service.ts`

**Purpose**: Manage invoices, payments, and billing operations.

**Key Features**:
- CRUD operations for invoices
- PDF generation and download
- Payment tracking
- Invoice status management
- Prestataire billing
- Statistics and reporting

**Usage Example**:

```typescript
import { InvoiceService } from '../../services/invoice.service';

@Component({
  // ...
})
export class InvoicesComponent {
  private invoiceService = inject(InvoiceService);

  loadInvoices() {
    this.invoiceService.getInvoices({
      page: 1,
      per_page: 25,
      status: InvoiceStatus.PAID
    }).subscribe({
      next: (response) => {
        this.invoices = response.data;
      }
    });
  }
}
```

**Key Methods**:

- `getInvoices(params?)`: Get paginated invoices list
- `getInvoice(uuid)`: Get single invoice
- `createInvoice(data)`: Create new invoice
- `updateInvoice(uuid, data)`: Update invoice
- `deleteInvoice(uuid)`: Delete invoice
- `sendInvoice(uuid)`: Send invoice to client
- `markAsPaid(uuid)`: Mark invoice as paid
- `cancelInvoice(uuid)`: Cancel invoice
- `downloadPdf(uuid)`: Download invoice PDF
- `getStats(params?)`: Get invoice statistics

**Static Utility Methods**:

- `calculateTotals(items)`: Calculate invoice totals
- `formatAmount(amount)`: Format currency for display
- `getStatusLabel(status)`: Get human-readable status
- `getStatusColor(status)`: Get color class for status

**Data Types**:

```typescript
enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled'
}

interface Invoice {
  uuid: string;
  invoice_number: string;
  amount_ht: number;
  amount_ttc: number;
  status: InvoiceStatus;
  // ... other fields
}
```

---

### SubscriptionService

**Location**: `src/app/services/subscription.service.ts`

**Purpose**: Manage subscriptions, billing, and Stripe integration.

**Key Features**:
- Subscription management
- Plan comparison and upgrade
- Stripe Checkout integration
- Customer Portal access
- Usage tracking
- Invoice history

**Usage Example**:

```typescript
import { SubscriptionService } from '../../services/subscription.service';

@Component({
  // ...
})
export class SubscriptionComponent {
  private subscriptionService = inject(SubscriptionService);

  loadSubscription() {
    this.subscriptionService.getCurrentSubscription().subscribe({
      next: (subscription) => {
        this.currentSubscription = subscription;
      }
    });
  }

  upgradePlan(newPlan: SubscriptionPlan) {
    this.subscriptionService.getCheckoutUrl(newPlan, 'monthly').subscribe({
      next: (response) => {
        // Redirect to Stripe Checkout
        window.location.href = response.url;
      }
    });
  }
}
```

**Key Methods**:

- `getCurrentSubscription()`: Get company subscription
- `getUsage()`: Get usage statistics
- `getPlans()`: Get available plans
- `createSubscription(data)`: Create new subscription
- `updateSubscription(data)`: Update subscription
- `cancelSubscription()`: Cancel subscription
- `resumeSubscription()`: Resume cancelled subscription
- `getCheckoutUrl(plan, interval)`: Get Stripe Checkout URL
- `getBillingPortalUrl()`: Get Stripe Customer Portal URL

**Static Utility Methods**:

- `formatPrice(amount, currency)`: Format price for display
- `getPlanName(plan)`: Get human-readable plan name
- `getStatusLabel(status)`: Get status label
- `getStatusColor(status)`: Get status color
- `calculateAnnualSavings(monthly, yearly)`: Calculate discount percentage

**Data Types**:

```typescript
enum SubscriptionPlan {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}

enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELLED = 'cancelled'
}
```

---

### PrestataireService

**Location**: `src/app/services/prestataire.service.ts`

**Purpose**: Manage prestataires (subcontractors/vendors) and their compliance.

**Key Features**:
- CRUD operations for prestataires
- Invitation system
- Compliance tracking
- Document management
- Statistics and reporting

**Usage Example**:

```typescript
import { PrestataireService } from '../../services/prestataire.service';

@Component({
  // ...
})
export class PrestatairesComponent {
  private prestataireService = inject(PrestataireService);

  loadPrestataires() {
    this.prestataireService.getPrestataires({
      compliance_status: ComplianceStatus.COMPLIANT
    }).subscribe({
      next: (response) => {
        this.prestataires = response.data;
      }
    });
  }

  invitePrestataire(data: InviteDto) {
    this.prestataireService.invitePrestataire(data).subscribe({
      next: () => {
        // Show success message
      }
    });
  }
}
```

**Key Methods**:

- `getPrestataires(params?)`: Get paginated prestataires list
- `getPrestataire(uuid)`: Get single prestataire
- `createPrestataire(data)`: Create new prestataire
- `updatePrestataire(uuid, data)`: Update prestataire
- `deletePrestataire(uuid)`: Delete prestataire
- `invitePrestataire(data)`: Send invitation
- `getInvitations(params?)`: Get pending invitations
- `getStats()`: Get prestataire statistics
- `getDocuments(uuid, params?)`: Get prestataire documents

**Static Utility Methods**:

- `getComplianceStatusLabel(status)`: Get status label
- `getComplianceStatusColor(status)`: Get status color
- `formatComplianceScore(score)`: Format score percentage
- `isCompliant(prestataire)`: Check if compliant
- `hasIssues(prestataire)`: Check if has compliance issues

**Data Types**:

```typescript
enum ComplianceStatus {
  COMPLIANT = 'compliant',
  INCOMPLETE = 'incomplete',
  EXPIRED = 'expired',
  BLOCKED = 'blocked'
}

interface Prestataire {
  uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  compliance_score: number;
  compliance_status: ComplianceStatus;
  // ... other fields
}
```

---

### FreeInvoiceService

**Location**: `src/app/services/free-invoice.service.ts`

**Purpose**: Contractor-side free invoices (`/invoices/free`, `ContractorFreeInvoicesComponent`) — claim creation + PDF upload for invoices not tied to a tuita.fr mission.

**Key Methods**:
- `request(subject, amount_requested_ttc, justification, attachments)` — creates a `FreeInvoiceRequest` (TTL 30j)
- `upload(uuid, pdf)` — uploads the PDF once admin approved (strict equality vs `amount_authorized_ttc`)
- `list()` — contractor's own free invoices

### ProfileService

**Location**: `src/app/services/profile.service.ts`

**Purpose**: Contractor profile (`/profile`, `ContractorProfileComponent`) — identity (read-only from `__contractor_ssid`) + email notification preferences.

**Key Methods**:
- `getProfile()` — returns identity + notification preferences (with defaults auto-created)
- `updateNotifications({ email_address?, email_invoice_payment?, email_document_expiry?, email_invoice_rejected?, email_onboarding? })` — throttled 30/min
- `logout()` — expires the `__contractor_ssid` cookie locally

---

## Admin Services (Backoffice)

All admin services target `/api/contractor/admin/*` endpoints and inject the `X-Tuita-Admin-Key` header (read from `sessionStorage.getItem('tuita_admin_key')`) on every request. A 401/403 response triggers a snackbar + redirect to `/admin`.

### AdminContractorService

**Location**: `src/app/services/admin-contractor.service.ts`

**Purpose**: Powers the supervision dashboard at `/admin` (`ContractorAdminComponent`).

**Surface**:
- Stuck invoices widget (4 status badges, 60s auto-refresh)
- System health, queue depths, failed jobs (retry / retry-all)
- Webhook logs (filter + replay individual + DLQ replay-all with mandatory reason ≥10 chars)
- Circuit breaker states (`tuita_main`, `mistral`, `deepface`, `pappers`, `urssaf_avcs`)
- Compliance KPIs

### AdminInvoiceService

**Location**: `src/app/services/admin-invoice.service.ts`

**Purpose**: Backs `/admin/invoices` (`AdminInvoicesComponent` — 5 tabs: To validate / To pay 🚩 / In progress / Disputes / All).

**Key Methods**:
- `markPaymentInProgress(uuid, payment_ref)` — transition `READY_TO_PAY → PAYMENT_IN_PROGRESS`
- `markPaid(uuid, paid_at, payment_ref, skip_in_progress?, reason?)` — strict D1, fast path with `skip_in_progress=true` requires `reason`
- `reopen(uuid, reason)` — D2, clones a `REJECTED` invoice (max 2 per `mission_ref`)
- `resolveDispute(uuid)` — D3, post-PAID dispute resolution
- `addNote(uuid, note)`, `getAuditTrail(uuid)` — chronological history

### AdminSettingsService

**Location**: `src/app/services/admin-settings.service.ts`

**Purpose**: `/admin/settings` (`AdminSettingsComponent`) — edit `platform_settings` rows.

**Key Methods**:
- `list(prefix?)` — table filtered by prefix (`kyc.`, `ocr.`, `compliance.`)
- `update(key, value, reason)` — `reason` is **mandatory** (audit log)
- `reset(key, reason)` — fall back to `.env` value with audited reason

### AdminKycService

**Location**: `src/app/services/admin-kyc.service.ts`

**Purpose**: `/admin/kyc-failures` (`AdminKycFailuresComponent`) — **read-only** by security design (no force-approve in UI).

**Key Methods**:
- `listFailures(filters)` — filter by `failure_reason`
- `getSession(uuid)` — DeepFace scores, `biometric_result` JSON, artifact thumbnails (best frame + video frames + face_photo)
- `fetchArtifact(path)` — returns blob for preview via `URL.createObjectURL`

### AdminFreeInvoiceService

**Location**: `src/app/services/admin-free-invoice.service.ts`

**Purpose**: `/admin/free-invoices` (`AdminFreeInvoicesComponent`) — approve/reject `FreeInvoiceRequest`.

**Key Methods**:
- `listPending(filters)`, `listAll(filters)`
- `approve(uuid, amount_authorized_ttc, ttl_days?)` — locks the authorized amount (strict equality on upload)
- `reject(uuid, reason)`

### AdminContractorComplianceService

**Location**: `src/app/services/admin-contractor-compliance.service.ts`

**Purpose**: Per-contractor compliance drill-down (documents, KYC, certification status).

### AdminDocumentService

**Location**: `src/app/services/admin-document.service.ts`

**Purpose**: Document admin lookups + the document detail dialog (read-only since the zero-manual-intervention policy of 2026-04-22 — admins can no longer revalidate OCR-rejected documents).

> **Note on `AdminPurchasesComponent` (`/admin/purchases`)** — this page queries `/api/contractor/admin/purchases*` directly via `HttpClient` (no dedicated service file). Endpoints: `list`, `stats`, `detail`, `retry`, `stuck`, `export` (streamed CSV).

---

## UI Services

### LoadingService

**Location**: `src/app/services/loading.service.ts`

**Purpose**: Manage global loading state for async operations.

**Key Features**:
- Global loading observable
- Loading counter for multiple concurrent requests
- Automatic loading state management

**Usage Example**:

```typescript
import { LoadingService } from '../../services/loading.service';

@Component({
  // ...
})
export class MyComponent {
  private loadingService = inject(LoadingService);
  protected readonly loading$ = this.loadingService.loading$;

  loadData() {
    this.loadingService.show();

    this.api.getData().subscribe({
      next: (data) => {
        // Process data
        this.loadingService.hide();
      },
      error: (error) => {
        // Handle error
        this.loadingService.hide();
      }
    });
  }
}
```

**Key Methods**:

- `show()`: Increment loading counter
- `hide()`: Decrement loading counter
- `loading$`: Observable<boolean> for loading state

---

### NotificationService

**Location**: `src/app/services/notification.service.ts`

**Purpose**: Display toast notifications and alerts.

**Key Features**:
- Toast notifications
- Success/error/warning/info messages
- Auto-dismiss with configurable duration
- Stack management
- Smart alerts for business events

**Usage Example**:

```typescript
import { NotificationService } from '../../services/notification.service';

@Component({
  // ...
})
export class MyComponent {
  private notificationService = inject(NotificationService);

  saveData() {
    this.api.save(data).subscribe({
      next: () => {
        this.notificationService.showSuccess('Données sauvegardées');
      },
      error: () => {
        this.notificationService.showError('Erreur de sauvegarde');
      }
    });
  }
}
```

**Key Methods**:

- `showSuccess(message, duration?)`: Show success toast
- `showError(message, duration?)`: Show error toast
- `showWarning(message, duration?)`: Show warning toast
- `showInfo(message, duration?)`: Show info toast
- `showAlert(alert)`: Show smart alert

---

### BreadcrumbService

**Location**: `src/app/breadcrumb.service.ts`

**Purpose**: Manage navigation breadcrumbs.

**Key Features**:
- Automatic breadcrumb generation from routes
- Custom breadcrumb labels
- Breadcrumb hierarchy

**Usage Example**:

```typescript
import { BreadcrumbService } from '../../breadcrumb.service';

@Component({
  // ...
})
export class MyComponent {
  private breadcrumbService = inject(BreadcrumbService);

  ngOnInit() {
    this.breadcrumbService.setBreadcrumbs([
      { label: 'Home', url: '/' },
      { label: 'Documents', url: '/documents' },
      { label: 'Document Detail' }
    ]);
  }
}
```

---

## Mock Services

### Overview

Mock services provide realistic data for development and testing without requiring a running backend.

**Location**: `src/app/services/mock/`

**Available Mock Services**:

- `MockAuthService`: Mock authentication
- `MockDocumentService`: Mock document management
- `MockEmployeeService`: Mock employee management
- `MockCompanyService`: Mock company management
- `MockDashboardService`: Mock dashboard data

**Enabling Mock Services**:

```typescript
// In environment.ts
export const environment = {
  features: {
    enableMockData: true // Enable mock services
  }
};
```

**Mock Data Structure**:

Mock services provide:
- Realistic data models
- Simulated delays
- Error scenarios
- Pagination support
- Filtering and sorting

---

## Service Best Practices

### 1. Dependency Injection

Always use `inject()` for services in standalone components:

```typescript
@Component({
  standalone: true
})
export class MyComponent {
  private service = inject(MyService); // ✅ Good
}
```

### 2. Subscription Management

Use `takeUntil` to prevent memory leaks:

```typescript
private destroy$ = new Subject<void>();

ngOnInit() {
  this.service.getData()
    .pipe(takeUntil(this.destroy$))
    .subscribe(data => {
      // Handle data
    });
}

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

### 3. Error Handling

Always handle errors in subscriptions:

```typescript
this.service.getData().subscribe({
  next: (data) => {
    // Handle success
  },
  error: (error) => {
    this.notificationService.showError(error.message);
  }
});
```

### 4. Loading States

Use LoadingService for better UX:

```typescript
this.loadingService.show();

this.service.getData().subscribe({
  next: (data) => {
    // Process data
    this.loadingService.hide();
  },
  error: (error) => {
    this.loadingService.hide();
  }
});
```

### 5. Type Safety

Always use proper TypeScript types:

```typescript
interface MyData {
  id: string;
  name: string;
}

this.service.getData<MyData>().subscribe({
  next: (data: MyData) => {
    // TypeScript knows the shape of data
  }
});
```

---

## Testing Services

### Unit Testing

```typescript
import { TestBed } from '@angular/core/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should make GET request', (done) => {
    service.get<TestData>('endpoint').subscribe(data => {
      expect(data).toBeDefined();
      done();
    });
  });
});
```

---

## Conclusion

Services in Tuita Compliance follow a consistent pattern:
- Single responsibility
- Dependency injection
- Observable-based async operations
- Proper error handling
- Type safety
- Testability

For questions or contributions, contact the development team.
