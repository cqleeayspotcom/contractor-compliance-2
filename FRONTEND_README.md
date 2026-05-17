# Tuita Compliance - Frontend Application

## Overview

This is the Angular 17+ frontend application for Tuita Compliance, a B2B SaaS platform for vendor/subcontractor compliance verification.

## Tech Stack

- **Framework**: Angular 17+ (Standalone Components)
- **UI Library**: Angular Material 21+
- **State Management**: RxJS Observables
- **HTTP**: Angular HttpClient with custom interceptors
- **Forms**: Reactive Forms
- **Routing**: Angular Router with guards
- **Build Tool**: Angular CLI
- **Package Manager**: npm

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── layout/          # Layout components (header, sidebar, footer)
│   │   │   ├── shared/          # Shared components (empty state, loading, etc.)
│   │   │   └── forms/           # Form components
│   │   ├── core/
│   │   │   ├── constants/       # Application constants
│   │   │   └── models/          # Data models and interfaces
│   │   ├── directives/          # Custom directives
│   │   ├── guards/              # Route guards (auth, role, guest)
│   │   ├── interceptors/        # HTTP interceptors
│   │   ├── pages/               # Feature pages
│   │   │   ├── admin/           # Admin pages
│   │   │   ├── auth/            # Authentication pages
│   │   │   ├── companies/       # Company management
│   │   │   ├── dashboard/       # Dashboard
│   │   │   ├── documents/       # Document management
│   │   │   ├── employees/       # Employee management
│   │   │   ├── invoices/        # Invoice management
│   │   │   ├── prestataires/    # Prestataire management
│   │   │   ├── settings/        # Settings pages
│   │   │   ├── subscription/    # Subscription & billing
│   │   │   └── kyc-mobile/      # Mobile KYC verification
│   │   ├── pipes/               # Custom pipes
│   │   ├── services/            # Application services
│   │   │   ├── api/             # API services
│   │   │   ├── auth/            # Authentication services
│   │   │   └── mock/            # Mock services for development
│   │   ├── app.config.ts        # Application configuration
│   │   ├── app.routes.ts        # Route definitions
│   │   └── app.ts               # Root component
│   ├── assets/                  # Static assets
│   ├── environments/            # Environment configurations
│   └── styles/                  # Global styles
├── angular.json                 # Angular configuration
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript configuration
└── proxy.conf.json              # Dev server proxy configuration
```

## Key Features

### Authentication & Authorization
- JWT token management with automatic refresh
- Role-based access control (Admin, Company, Employee)
- Protected routes with guards
- Session management with timeout warnings

### Dashboard (tile-based homepage, 2026-04-22)
- Responsive grid `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` (max 3 columns)
- 4 status tiles: Documents, Identity & Certification, Interventions, Invoices
- 1 conditional upsell tile: "Passer en Pro" (only on free plan)
- Per-tile status icon: ✓ Conforme / ⚠ À compléter / ✗ Bloqué
- SVG progress bar removed — each tile now carries its own state

### Document Management
- **Synchronous upload** (2026-04-22) — verdict returned inline in the HTTP response, no polling needed. HttpClient timeout bumped to 120 s on upload endpoints.
- Upload page layout: dropzone on top, "Documents à fournir" checklist below.
- Drag & drop (desktop), photo capture (mobile), HEIC support (iOS).
- Auto-rejection with machine-readable codes (`statuts_unreadable`, `rib_missing_holder`, `kbis_not_original`, `company_not_found`, `company_closed`, `company_name_mismatch`, `company_verification_unavailable`, `urssaf_not_authentic`, `urssaf_authenticity_check_unavailable`, etc.) — frontend maps each code to a user-friendly message + actionable CTA via [document-rejection-messages.ts](src/app/pages/contractor-documents/document-rejection-messages.ts).
- Multi-format support (PDF, images).

### Invoice Management
- **Synchronous upload** for freemium (2026-04-22) — OCR + cross-check mission are run inline, verdict within ~60 s.
- Timeline portal per invoice (submitted → ocr_validated → validator approvals → ready_to_pay → payment_in_progress → paid).
- Track payment status in real time via the timeline.
- Download PDF invoices.
- Rejection codes mapped to actionable messages (see `invoice-rejection-messages.ts`).

### Prestataire Management
- Add and manage prestataires
- Invitation system
- Compliance tracking
- Document verification

### Subscription & Billing
- Stripe integration for payments
- Plan comparison and upgrade
- Usage statistics
- Billing portal integration

### Settings
- Profile management
- Company settings
- Security settings
- Notification preferences

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Angular CLI 21+
- Backend API running on port 8000

### Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment:
```bash
cp src/environments/environment.ts src/environments/environment.local.ts
# Edit environment.local.ts with your configuration
```

3. Start development server:
```bash
npm start
# or
ng serve
```

4. Build for production:
```bash
npm run build
# or
ng build --configuration production
```

## Development

### Running Tests
```bash
npm test
```

### Code Generation
```bash
# Generate a new component
ng generate component component-name

# Generate a new service
ng generate service service-name

# Generate API client from OpenAPI spec
npm run generate-api
```

### Linting
```bash
npm run lint
```

### Formatting
```bash
npm run format
```

## Configuration

### Environment Variables

See `src/environments/environment.ts` for available configuration options:

- `apiUrl`: Backend API URL
- `frontendUrl`: Frontend URL for CORS
- `stripe.publishableKey`: Stripe publishable key
- `features`: Feature flags
- `pagination`: Default pagination settings
- `upload`: File upload restrictions

### Proxy Configuration

The development server proxies API requests to the backend (see `proxy.conf.json`).

### API Integration

The application uses a custom `ApiService` for HTTP communication with:
- Automatic JWT token injection
- Request/response interceptors
- Error handling
- Loading states
- File upload/download support

## Services

### API Services
- `ApiService`: Base HTTP client
- `AuthService`: Authentication & authorization
- `InvoiceService`: Invoice management
- `SubscriptionService`: Subscription & billing
- `PrestataireService`: Prestataire management
- `DocumentService`: Document management
- `KYCService`: KYC verification
- `FreeInvoiceService`: Contractor free invoices (request + upload)
- `ProfileService`: Contractor profile + email notification preferences

### Admin Services (`X-Tuita-Admin-Key` header per request)
- `AdminContractorService`: Compliance stats, queues, failed jobs, webhooks, circuit breakers
- `AdminInvoiceService`: Invoice management (mark-paid, reopen, resolve-dispute, audit trail)
- `AdminSettingsService`: `platform_settings` edit + reset (with mandatory reason)
- `AdminKycService`: KYC failures viewer (read-only)
- `AdminFreeInvoiceService`: FreeInvoiceRequest approve/reject
- `AdminContractorComplianceService`: Per-contractor compliance drill-down
- `AdminDocumentService`: Document admin actions
> Note: `AdminPurchasesComponent` calls `/api/contractor/admin/purchases*` via `HttpClient` directly (no dedicated service file).

### Supporting Services
- `LoadingService`: Global loading state
- `NotificationService`: Toast notifications
- `BreadcrumbService`: Navigation breadcrumbs
- `IconService`: Material icon mapping

## Components

### Layout Components
- `MainLayoutComponent`: Main application layout
- `HeaderComponent`: Navigation header
- `SidebarComponent`: Navigation sidebar
- `FooterComponent`: Application footer

### Shared Components
- `EmptyStateComponent`: Empty state placeholder
- `LoadingSpinnerComponent`: Loading indicator
- `ErrorAlertComponent`: Error message display
- `ComplianceScoreCardComponent`: Compliance score visualization
- `ExpiringDocumentsWidgetComponent`: Expiring documents list
- `ConfirmationDialogComponent`: Confirmation dialog

## Routing

### Route Structure

```
/                          → Redirects to /dashboard
/auth                      → Authentication routes
  /login                   → Login page
  /register                → Registration page
  /forgot-password         → Forgot password
  /reset-password          → Reset password
/dashboard                 → Dashboard (protected)
/documents                 → Document management (protected)
  /upload                  → Upload document
  /:uuid                   → Document detail
/prestataires              → Prestataire management (protected)
  /create                  → Add prestataire
  /:uuid                   → Prestataire detail
  /invitations             → Pending invitations
/invoices                  → Invoice management (protected)
  /create                  → Create invoice
  /:uuid                   → Invoice detail
/subscription              → Subscription & billing (protected)
/settings                  → Settings (protected)
  /profile                 → Profile settings
  /company                 → Company settings
  /security                → Security settings
  /notifications           → Notification settings
  /billing                 → Billing settings
/admin                     → ContractorAdminComponent (supervision dashboard)
  /invoices                → AdminInvoicesComponent (5 tabs, kebab actions, audit trail)
  /settings                → AdminSettingsComponent (platform_settings + reason)
  /kyc-failures            → AdminKycFailuresComponent (read-only)
  /purchases               → AdminPurchasesComponent (Pappers tracking + CSV export)
  /free-invoices           → AdminFreeInvoicesComponent (approve/reject)
/documents/purchases       → ContractorPurchasesComponent (history + refund display)
/invoices/free             → ContractorFreeInvoicesComponent (free invoices)
/kyc/mobile/:token         → Mobile KYC (public)

> **Admin auth**: all `/admin/*` pages read `sessionStorage.getItem('tuita_admin_key')` and inject it into every HTTP request via `X-Tuita-Admin-Key` header. 401/403 → snackbar + redirect to `/admin`. Confirm dialog mandatory for irreversible actions. All admin pages are standalone + `ChangeDetectionStrategy.OnPush` + signals + 3 separated TS/HTML/SCSS files.
```

### Route Guards

- `authGuard`: Requires authentication
- `guestGuard`: Redirects authenticated users
- `roleGuard`: Requires specific role(s)

## State Management

The application uses RxJS for state management:
- Services expose observables
- Components subscribe to observables
- Automatic cleanup with `takeUntil`
- Shared state via services

## Error Handling

### Global Error Handling
- HTTP interceptor catches errors
- User-friendly error messages
- Automatic token refresh on 401
- Notification service displays errors

### Component-Level Error Handling
- Try-catch in service calls
- User-friendly error states
- Retry mechanisms
- Error logging

## Performance

### Optimization
- Lazy loading for routes
- OnPush change detection
- TrackBy for lists
- Virtual scrolling for large lists
- Image optimization
- Bundle size optimization

### Best Practices
- Memoization with pure pipes
- Efficient change detection
- Proper subscription management
- Code splitting

## Accessibility

- ARIA labels on interactive elements
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support
- Focus management

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contributing

1. Follow the existing code style
2. Write unit tests for new features
3. Update documentation
4. Submit pull requests

## License

Proprietary - All rights reserved

## Support

For issues and questions, please contact the development team.
