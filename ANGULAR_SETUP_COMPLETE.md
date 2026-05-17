# Tuita Compliance - Angular Frontend Application

## 🎯 Project Overview

Complete Angular 17+ frontend application for Tuita Compliance, a B2B SaaS platform for vendor/subcontractor compliance verification.

## ✨ Key Features Implemented

### 1. **Core Architecture**
- ✅ Angular 17+ with Standalone Components
- ✅ Angular Material 21+ UI library
- ✅ RxJS for reactive programming
- ✅ TypeScript strict mode
- ✅ Modular architecture with feature-based organization

### 2. **Authentication & Authorization**
- ✅ JWT token management with automatic refresh
- ✅ Role-based access control (Admin, Company, Employee)
- ✅ Protected routes with guards
- ✅ Session timeout warnings
- ✅ Password reset flow
- ✅ Multi-factor authentication ready

### 3. **Dashboard**
- ✅ Real-time KPIs and statistics
- ✅ Compliance score overview
- ✅ Expiring documents alerts
- ✅ Recent activity feed
- ✅ Interactive charts and graphs

### 4. **Document Management**
- ✅ Upload documents with drag & drop
- ✅ Document verification tracking
- ✅ OCR processing status
- ✅ Multi-format support (PDF, images)
- ✅ Document expiration alerts
- ✅ Bulk operations

### 5. **Invoice Management** ⭐ NEW
- ✅ Create and send invoices
- ✅ Track payment status
- ✅ Download PDF invoices
- ✅ Automatic payment reminders
- ✅ Invoice statistics dashboard
- ✅ Prestataire billing
- ✅ Overdue invoice tracking

### 6. **Prestataire Management** ⭐ NEW
- ✅ Add and manage prestataires
- ✅ Invitation system with email
- ✅ Compliance tracking
- ✅ Document verification
- ✅ Active/inactive status
- ✅ Search and filtering
- ✅ Compliance score dashboard

### 7. **Subscription & Billing** ⭐ NEW
- ✅ Stripe integration for payments
- ✅ Plan comparison and upgrade
- ✅ Usage statistics tracking
- ✅ Billing portal integration
- ✅ Invoice history
- ✅ Subscription management
- ✅ Automatic renewal handling

### 8. **Settings**
- ✅ Profile management
- ✅ Company settings
- ✅ Security settings
- ✅ Notification preferences
- ✅ Billing information

## 🏗️ Architecture

### Project Structure
```
frontend/
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── layout/          # Layout components
│   │   │   ├── shared/          # Shared/reusable components
│   │   │   └── forms/           # Form components
│   │   ├── core/
│   │   │   ├── constants/       # Application constants
│   │   │   └── models/          # TypeScript interfaces
│   │   ├── directives/          # Custom directives
│   │   ├── guards/              # Route guards
│   │   ├── interceptors/        # HTTP interceptors
│   │   ├── pages/               # Feature pages
│   │   │   ├── admin/           # Admin dashboard
│   │   │   ├── auth/            # Authentication
│   │   │   ├── companies/       # Company management
│   │   │   ├── dashboard/       # Main dashboard
│   │   │   ├── documents/       # Document management
│   │   │   ├── employees/       # Employee management
│   │   │   ├── invoices/        # Invoice management ⭐
│   │   │   ├── prestataires/    # Prestataire management ⭐
│   │   │   ├── settings/        # Settings
│   │   │   ├── subscription/    # Subscription & billing ⭐
│   │   │   └── kyc-mobile/      # Mobile KYC
│   │   ├── pipes/               # Custom pipes
│   │   ├── services/            # Business logic
│   │   │   ├── api/             # API services ⭐
│   │   │   ├── auth/            # Auth services
│   │   │   └── mock/            # Mock services
│   │   ├── app.config.ts        # App configuration
│   │   ├── app.routes.ts        # Route definitions
│   │   └── app.ts               # Root component
│   ├── assets/                  # Static assets
│   ├── environments/            # Environment configs
│   └── styles/                  # Global styles
├── angular.json                 # Angular configuration
├── package.json                 # Dependencies
└── tsconfig.json                # TypeScript config
```

## 🔧 Services

### API Services ⭐ NEW
- **ApiService**: Base HTTP client with interceptors
  - Automatic JWT injection
  - Error handling
  - File upload/download
  - Pagination support

- **InvoiceService**: Invoice management
  - CRUD operations
  - PDF generation
  - Payment tracking
  - Statistics

- **SubscriptionService**: Billing & subscriptions
  - Stripe integration
  - Plan management
  - Usage tracking
  - Billing portal

- **PrestataireService**: Prestataire management
  - CRUD operations
  - Invitation system
  - Compliance tracking
  - Statistics

### Business Services
- **AuthService**: Authentication & authorization
- **DocumentService**: Document management
- **EmployeeService**: Employee management
- **KYCService**: KYC verification
- **FreeInvoiceService**: Contractor free invoices (request + upload)
- **ProfileService**: Contractor profile + email notification preferences

### Admin Services (`X-Tuita-Admin-Key` header per request)
- **AdminContractorService**: Compliance stats, queues, failed jobs, webhooks, circuit breakers
- **AdminInvoiceService**: Invoice management (mark-paid, reopen, resolve-dispute, audit trail)
- **AdminSettingsService**: `platform_settings` edit + reset (with mandatory reason)
- **AdminKycService**: KYC failures viewer (read-only)
- **AdminFreeInvoiceService**: FreeInvoiceRequest approve/reject
- **AdminContractorComplianceService**: Per-contractor compliance drill-down
- **AdminDocumentService**: Document admin actions
> Note: `AdminPurchasesComponent` queries `/api/contractor/admin/purchases*` directly via `HttpClient` (no dedicated service file).

### UI Services
- **LoadingService**: Global loading state
- **NotificationService**: Toast notifications
- **BreadcrumbService**: Navigation breadcrumbs
- **IconService**: Material icon mapping

## 🛣️ Routing

### Route Structure
```
/                          → Dashboard (protected)
/auth                      → Authentication (public)
  /login                   → Login
  /register                → Registration
  /forgot-password         → Forgot password
  /reset-password          → Reset password
/dashboard                 → Main dashboard
/documents                 → Document management
  /upload                  → Upload document
  /:uuid                   → Document detail
/prestataires              → Prestataire management ⭐
  /create                  → Add prestataire
  /:uuid                   → Prestataire detail
  /invitations             → Pending invitations
/invoices                  → Invoice management ⭐
  /create                  → Create invoice
  /:uuid                   → Invoice detail
/subscription              → Subscription & billing ⭐
/settings                  → Settings
  /profile                 → Profile
  /company                 → Company settings
  /security                → Security
  /notifications           → Notifications
  /billing                 → Billing
/admin                     → ContractorAdminComponent (supervision dashboard)
  /invoices                → AdminInvoicesComponent (5 tabs, kebab actions, audit trail)
  /settings                → AdminSettingsComponent (platform_settings + reason)
  /kyc-failures            → AdminKycFailuresComponent (read-only)
  /purchases               → AdminPurchasesComponent (Pappers tracking + CSV export)
  /free-invoices           → AdminFreeInvoicesComponent (approve/reject)
/documents/purchases       → ContractorPurchasesComponent (history + refund display)
/invoices/free             → ContractorFreeInvoicesComponent (free invoices)
/kyc/mobile/:token         → Mobile KYC (public)
```

## 🔐 Security Features

- JWT token authentication
- Automatic token refresh
- Role-based access control
- Protected API routes
- CSRF protection
- XSS protection
- Secure file upload
- Session management

## 📱 Responsive Design

- Mobile-first approach
- Material Design components
- Touch-friendly interface
- Adaptive layouts
- Performance optimized

## 🚀 Getting Started

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
# Edit environment.local.ts
```

3. Start development server:
```bash
npm start
```

4. Build for production:
```bash
npm run build
```

## 📊 Key Features by Module

### Invoice Management ⭐
- Create/send invoices
- Track payments
- Generate PDFs
- Payment reminders
- Statistics dashboard
- Prestataire billing
- Overdue tracking

### Prestataire Management ⭐
- Add/manage prestataires
- Email invitations
- Compliance tracking
- Document verification
- Active/inactive status
- Search & filtering
- Compliance dashboard

### Subscription & Billing ⭐
- Stripe payments
- Plan comparison
- Usage tracking
- Billing portal
- Invoice history
- Subscription management
- Auto-renewal

## 📝 Documentation

### Created Documentation Files
1. **FRONTEND_README.md** - Main frontend documentation
2. **angular.environments.md** - Environment configuration guide
3. **angular.services.md** - Services documentation

### Key Documentation Sections
- Architecture overview
- Component structure
- Service usage
- Routing configuration
- Environment setup
- Security best practices
- Performance optimization
- Testing strategies

## 🧪 Testing

### Testing Features
- Unit tests with Vitest
- Integration tests
- E2E tests ready
- Mock services for testing
- Test utilities

### Running Tests
```bash
npm test                    # Run all tests
npm run test:coverage       # With coverage
npm run test:ci            # CI mode
```

## 🎨 UI/UX Features

- Material Design components
- Dark mode ready
- Responsive layouts
- Loading states
- Error handling
- Empty states
- Confirmation dialogs
- Toast notifications
- Progress indicators

## 🔧 Development Tools

- Angular CLI
- TypeScript strict mode
- Prettier formatting
- ESLint linting
- Hot module replacement
- Proxy configuration
- Source maps

## 📦 Key Dependencies

```json
{
  "@angular/animations": "^21.2.8",
  "@angular/cdk": "^21.2.6",
  "@angular/material": "^21.2.6",
  "rxjs": "~7.8.0",
  "typescript": "~5.9.2"
}
```

## 🎯 Best Practices Implemented

- Standalone components
- Dependency injection
- Reactive programming
- Type safety
- Error handling
- Loading states
- Subscription management
- Memory leak prevention
- Performance optimization

## 🚦 Status

### ✅ Completed Features
- Complete application structure
- Authentication system
- Dashboard with KPIs
- Document management
- Invoice management ⭐ NEW
- Prestataire management ⭐ NEW
- Subscription & billing ⭐ NEW
- Settings pages
- Admin routes
- API integration
- Responsive design
- Error handling
- Loading states

### 🔄 Ready for Enhancement
- Advanced reporting
- Real-time notifications
- File preview
- Bulk operations
- Advanced search
- Export functionality

## 📈 Performance

- Lazy loading for routes
- OnPush change detection
- Virtual scrolling ready
- Image optimization
- Bundle size optimization
- Code splitting

## 🔗 Integration

### Backend Integration
- Laravel API compatibility
- UUID-based routing
- JWT authentication
- File upload/download
- Error handling
- Pagination support

### Third-party Services
- Stripe payments
- Email notifications
- File storage (S3-compatible)
- OCR processing

## 📞 Support

For technical questions or issues:
1. Check documentation files
2. Review inline code comments
3. Contact development team

## 🎉 Summary

This Angular application provides a complete, production-ready frontend for Tuita Compliance with:

- **Modern Architecture**: Angular 17+ with standalone components
- **Complete Feature Set**: Dashboard, documents, invoices, prestataires, subscription
- **Security**: JWT authentication, role-based access, secure file handling
- **Performance**: Lazy loading, OnPush CD, optimized bundles
- **Developer Experience**: TypeScript strict mode, comprehensive documentation
- **User Experience**: Material Design, responsive, loading states, error handling

The application is ready for deployment and can be extended with additional features as needed.

---

**Created**: 2025-04-14
**Version**: 1.0.0
**Status**: Production Ready ✅
