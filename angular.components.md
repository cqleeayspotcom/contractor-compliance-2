# Angular Components Documentation

## Overview

This document provides comprehensive documentation for all components in the Tuita Compliance Angular application.

## Table of Contents

1. [Layout Components](#layout-components)
2. [Shared Components](#shared-components)
3. [Feature Components](#feature-components)
4. [Component Best Practices](#component-best-practices)

---

## Layout Components

### MainLayoutComponent

**Location**: `src/app/components/layout/main-layout.component.ts`

**Purpose**: Main application layout wrapper that includes header, sidebar, and footer.

**Features**:
- Responsive layout with sidebar toggle
- User authentication state display
- Navigation menu
- Footer with company info

**Usage**:
```typescript
@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [HeaderComponent, SidebarComponent, FooterComponent],
  template: `
    <div class="main-layout">
      <app-header></app-header>
      <div class="content-wrapper">
        <app-sidebar></app-sidebar>
        <main class="main-content">
          <router-outlet></router-outlet>
        </main>
      </div>
      <app-footer></app-footer>
    </div>
  `
})
export class MainLayoutComponent {}
```

### HeaderComponent

**Location**: `src/app/components/layout/header.component.ts`

**Purpose**: Application header with navigation, user menu, and notifications.

**Features**:
- Logo and branding
- Navigation menu
- User dropdown menu
- Notification bell
- Mobile menu toggle

**Usage**:
```typescript
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [MatButtonModule, MatMenuModule, MatIconModule],
  template: `
    <header class="app-header">
      <div class="header-left">
        <button mat-icon-button (click)="toggleSidebar()">
          <mat-icon>menu</mat-icon>
        </button>
        <a [routerLink]="['/dashboard']" class="logo">
          Tuita Compliance
        </a>
      </div>
      <div class="header-right">
        <button mat-icon-button [matMenuTriggerFor]="notifMenu">
          <mat-icon>notifications</mat-icon>
        </button>
        <button mat-button [matMenuTriggerFor]="userMenu">
          <span>{{ currentUser?.name }}</span>
          <mat-icon>arrow_drop_down</mat-icon>
        </button>
      </div>
    </header>
  `
})
export class HeaderComponent {}
```

### SidebarComponent

**Location**: `src/app/components/layout/sidebar.component.ts`

**Purpose**: Navigation sidebar with menu items based on user role.

**Features**:
- Role-based menu items
- Active route highlighting
- Collapsible sections
- Mobile responsive

**Usage**:
```typescript
@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterModule, MatIconModule],
  template: `
    <nav class="sidebar">
      <a *ngFor="let item of menuItems"
         [routerLink]="item.path"
         routerLinkActive="active"
         class="menu-item">
        <mat-icon>{{ item.icon }}</mat-icon>
        <span>{{ item.label }}</span>
      </a>
    </nav>
  `
})
export class SidebarComponent {}
```

### FooterComponent

**Location**: `src/app/components/layout/footer.component.ts`

**Purpose**: Application footer with links and copyright information.

**Features**:
- Company information
- Legal links
- Social media links
- Copyright notice

---

## Shared Components

### EmptyStateComponent

**Location**: `src/app/components/shared/empty-state.component.ts`

**Purpose**: Display empty state with icon, message, and optional action button.

**Features**:
- Customizable icon and message
- Optional action button
- Responsive design
- Consistent styling

**Usage**:
```typescript
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  template: `
    <div class="empty-state">
      <mat-icon class="empty-icon">{{ icon }}</mat-icon>
      <h3 class="empty-title">{{ title }}</h3>
      <p class="empty-message">{{ message }}</p>
      <button mat-raised-button color="primary" *ngIf="actionLabel" (click)="actionClicked.emit()">
        <mat-icon>{{ actionIcon }}</mat-icon>
        {{ actionLabel }}
      </button>
    </div>
  `
})
export class EmptyStateComponent {
  @Input() icon: string = 'inbox';
  @Input() title: string = 'Aucune donnée';
  @Input() message: string = 'Commencez par ajouter votre premier élément';
  @Input() actionLabel?: string;
  @Input() actionIcon: string = 'add';
  @Output() actionClicked = new EventEmitter<void>();
}
```

**Example Usage**:
```html
<app-empty-state
  icon="people"
  title="Aucun prestataire"
  message="Ajoutez votre premier prestataire pour commencer"
  actionLabel="Ajouter un prestataire"
  (actionClicked)="createPrestataire()">
</app-empty-state>
```

### LoadingSpinnerComponent

**Location**: `src/app/components/shared/loading-spinner.component.ts`

**Purpose**: Display loading spinner with optional message.

**Features**:
- Configurable size
- Optional message
- Full-screen or inline mode

**Usage**:
```typescript
@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  template: `
    <div class="loading-spinner" [class.full-screen]="fullScreen">
      <mat-spinner [diameter]="diameter"></mat-spinner>
      <p *ngIf="message" class="loading-message">{{ message }}</p>
    </div>
  `
})
export class LoadingSpinnerComponent {
  @Input() diameter: number = 40;
  @Input() message?: string;
  @Input() fullScreen: boolean = false;
}
```

### ErrorAlertComponent

**Location**: `src/app/components/shared/error-alert.component.ts`

**Purpose**: Display error messages with optional retry action.

**Features**:
- Error icon and message
- Optional retry button
- Dismissible
- Color-coded by severity

**Usage**:
```typescript
@Component({
  selector: 'app-error-alert',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  template: `
    <div class="error-alert" [class.severity]="severity">
      <mat-icon class="error-icon">error</mat-icon>
      <div class="error-content">
        <h4 *ngIf="title">{{ title }}</h4>
        <p>{{ message }}</p>
      </div>
      <button mat-icon-button *ngIf="dismissible" (click)="dismiss.emit()">
        <mat-icon>close</mat-icon>
      </button>
    </div>
  `
})
export class ErrorAlertComponent {
  @Input() title?: string;
  @Input() message!: string;
  @Input() severity: 'low' | 'medium' | 'high' = 'medium';
  @Input() dismissible: boolean = true;
  @Output() dismiss = new EventEmitter<void>();
  @Output() retry = new EventEmitter<void>();
}
```

### ComplianceScoreCardComponent

**Location**: `src/app/components/shared/compliance-score-card.component.ts`

**Purpose**: Display compliance score with visual indicator.

**Features**:
- Circular progress indicator
- Color-coded by score
- Tooltip with details
- Historical comparison

**Usage**:
```typescript
@Component({
  selector: 'app-compliance-score-card',
  standalone: true,
  imports: [MatProgressBarModule, MatTooltipModule],
  template: `
    <div class="compliance-score-card">
      <mat-progress-bar
        mode="determinate"
        [value]="score"
        [color]="getScoreColor(score)">
      </mat-progress-bar>
      <div class="score-info">
        <span class="score-value">{{ Math.round(score) }}%</span>
        <span class="score-label">{{ getScoreLabel(score) }}</span>
      </div>
    </div>
  `
})
export class ComplianceScoreCardComponent {
  @Input() score: number = 0;
  @Input() showLabel: boolean = true;

  getScoreColor(score: number): string {
    if (score >= 80) return 'primary';
    if (score >= 50) return 'accent';
    return 'warn';
  }
}
```

### ConfirmationDialogComponent

**Location**: `src/app/components/shared/confirmation-dialog.component.ts`

**Purpose**: Modal dialog for confirming destructive actions.

**Features**:
- Customizable title and message
- Custom button labels
- Danger zone styling
- Material Design

**Usage**:
```typescript
@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">{{ data.cancelText || 'Annuler' }}</button>
      <button mat-raised-button color="warn" (click)="onConfirm()">
        {{ data.confirmText || 'Confirmer' }}
      </button>
    </mat-dialog-actions>
  `
})
export class ConfirmationDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmationDialogData
  ) {}

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
```

**Example Usage**:
```typescript
const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
  data: {
    title: 'Supprimer le document',
    message: 'Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible.',
    confirmText: 'Supprimer',
    cancelText: 'Annuler'
  }
});

dialogRef.afterClosed().subscribe(confirmed => {
  if (confirmed) {
    // Perform deletion
  }
});
```

---

## Feature Components

### DashboardComponent

**Location**: `src/app/pages/dashboard/dashboard.component.ts`

**Purpose**: Main dashboard with KPIs, statistics, and quick actions.

**Features**:
- Real-time KPI cards
- Compliance overview
- Expiring documents widget
- Recent activity feed
- Quick action buttons

**Key Features**:
```typescript
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [MatCardModule, MatButtonModule],
  template: `
    <div class="dashboard">
      <!-- KPI Cards -->
      <div class="kpi-grid">
        <mat-card class="kpi-card">
          <div class="kpi-value">{{ stats.totalDocuments }}</div>
          <div class="kpi-label">Documents</div>
        </mat-card>
        <!-- More KPIs... -->
      </div>

      <!-- Compliance Overview -->
      <app-compliance-score-card [score]="complianceScore"></app-compliance-score-card>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <button mat-raised-button (click)="uploadDocument()">
          <mat-icon>upload</mat-icon>
          Upload Document
        </button>
      </div>
    </div>
  `
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);

  stats: DashboardStats;
  complianceScore: number;

  ngOnInit() {
    this.loadDashboardData();
  }
}
```

### InvoicesListComponent ⭐ NEW

**Location**: `src/app/pages/invoices/invoices-list.component.ts`

**Purpose**: Display and manage invoices with filtering and actions.

**Features**:
- Paginated invoice list
- Status filtering
- Search functionality
- Quick actions menu
- Statistics cards
- PDF download

**Key Features**:
```typescript
@Component({
  selector: 'app-invoices-list',
  standalone: true,
  imports: [MatTableModule, MatPaginatorModule],
  template: `
    <div class="invoices-list">
      <!-- Stats Cards -->
      <div class="stats-grid">
        <mat-card class="stat-card">
          <p class="stat-value">{{ stats.total_amount }}</p>
          <p class="stat-label">Total Facturé</p>
        </mat-card>
        <!-- More stats... -->
      </div>

      <!-- Filters -->
      <mat-card class="filters">
        <mat-form-field>
          <mat-label>Rechercher</mat-label>
          <input matInput [(ngModel)]="searchQuery">
        </mat-form-field>
        <mat-select [(ngModel)]="statusFilter">
          <mat-option value="paid">Payées</mat-option>
          <mat-option value="sent">Envoyées</mat-option>
        </mat-select>
      </mat-card>

      <!-- Table -->
      <table mat-table [dataSource]="invoices">
        <ng-container matColumnDef="invoice_number">
          <th mat-header-cell>Facture</th>
          <td mat-cell>{{ row.invoice_number }}</td>
        </ng-container>
        <!-- More columns... -->
      </table>
    </div>
  `
})
export class InvoicesListComponent implements OnInit {
  private invoiceService = inject(InvoiceService);

  invoices: Invoice[] = [];
  stats: InvoiceStats;

  ngOnInit() {
    this.loadInvoices();
    this.loadStats();
  }
}
```

### PrestatairesListComponent ⭐ NEW

**Location**: `src/app/pages/prestataires/prestataires-list.component.ts`

**Purpose**: Manage prestataires with compliance tracking.

**Features**:
- Prestataire list with compliance scores
- Invitation system
- Compliance status filtering
- Quick actions
- Statistics dashboard

**Key Features**:
```typescript
@Component({
  selector: 'app-prestataires-list',
  standalone: true,
  imports: [MatTableModule, MatChipsModule],
  template: `
    <div class="prestataires-list">
      <!-- Stats -->
      <div class="stats-grid">
        <mat-card>
          <p class="stat-value">{{ stats.compliant }}</p>
          <p class="stat-label">Conformes</p>
        </mat-card>
        <!-- More stats... -->
      </div>

      <!-- Table -->
      <table mat-table [dataSource]="prestataires">
        <ng-container matColumnDef="name">
          <th mat-header-cell>Nom</th>
          <td mat-cell>
            {{ row.first_name }} {{ row.last_name }}
          </td>
        </ng-container>

        <ng-container matColumnDef="compliance_score">
          <th mat-header-cell>Score</th>
          <td mat-cell>
            <div class="compliance-score" [class]="getScoreClass(row.compliance_score)">
              {{ row.compliance_score }}%
            </div>
          </td>
        </ng-container>
        <!-- More columns... -->
      </table>
    </div>
  `
})
export class PrestatairesListComponent implements OnInit {
  private prestataireService = inject(PrestataireService);

  prestataires: Prestataire[] = [];
  stats: PrestataireStats;

  ngOnInit() {
    this.loadPrestataires();
    this.loadStats();
  }
}
```

### SubscriptionComponent ⭐ NEW

**Location**: `src/app/pages/subscription/subscription.component.ts`

**Purpose**: Manage subscription, view plans, and handle billing.

**Features**:
- Current subscription display
- Plan comparison
- Usage statistics
- Billing portal link
- Invoice history
- Upgrade/downgrade

**Key Features**:
```typescript
@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [MatCardModule, MatRadioModule],
  template: `
    <div class="subscription">
      <!-- Current Subscription -->
      <mat-card class="current-subscription">
        <h2>Abonnement actuel</h2>
        <mat-chip [color]="getStatusColor(subscription.status)">
          {{ getStatusLabel(subscription.status) }}
        </mat-chip>
        <button mat-button (click)="openBillingPortal()">
          Gérer le paiement
        </button>
      </mat-card>

      <!-- Plans -->
      <div class="plans-grid">
        <mat-card *ngFor="let plan of plans" class="plan-card">
          <h3>{{ plan.name }}</h3>
          <p class="plan-price">{{ plan.price | currency }}</p>
          <ul class="plan-features">
            <li *ngFor="let feature of plan.features">
              {{ feature }}
            </li>
          </ul>
          <button mat-raised-button
                  [disabled]="plan.id === subscription.plan"
                  (click)="selectPlan(plan.id)">
            Changer
          </button>
        </mat-card>
      </div>
    </div>
  `
})
export class SubscriptionComponent implements OnInit {
  private subscriptionService = inject(SubscriptionService);

  subscription: Subscription;
  plans: PlanDetails[];
  usage: SubscriptionUsage;

  ngOnInit() {
    this.loadSubscription();
    this.loadPlans();
    this.loadUsage();
  }
}
```

---

## Admin / Backoffice Components

All admin pages share the same conventions: standalone + `ChangeDetectionStrategy.OnPush` + signals + 3 separated TS/HTML/SCSS files. Auth = `sessionStorage.getItem('tuita_admin_key')` injected per-request via `X-Tuita-Admin-Key` header. 401/403 → snackbar + redirect to `/admin`. A confirm dialog is mandatory before any irreversible action (mark-paid, reopen, resolve-dispute, settings update/reset, DLQ replay-all).

| Route | Component | Purpose |
|---|---|---|
| `/admin` | `ContractorAdminComponent` | Supervision dashboard: stuck-invoices widget (4 badges, 60s auto-refresh), system health, queues, failed jobs (retry / retry-all), webhooks (filter + replay individual + DLQ replay-all with mandatory reason ≥10 chars), circuit breakers, compliance KPIs |
| `/admin/invoices` | `AdminInvoicesComponent` | 5 tabs (To validate / To pay 🚩 / In progress / Disputes / All). Kebab menu per row: `mark-payment-in-progress`, `mark-paid` (with optional fast-path `skip_in_progress` + reason), `reopen`, `resolve-dispute`, `force-resend-webhook`, `add-note`, audit trail (chronological). Validator chips (compliance / production / accounting) on the pending tab |
| `/admin/settings` | `AdminSettingsComponent` | Edit `platform_settings`: filterable table by prefix (`kyc.`, `ocr.`, `compliance.`), modal edit per key with **mandatory `reason` field**, reset-to-env-fallback button (audited) |
| `/admin/kyc-failures` | `AdminKycFailuresComponent` | **Read-only** (security by design): KYC sessions list, filter by `failure_reason`, detail modal with DeepFace scores + `biometric_result` JSON + artifact thumbnails (best frame + video frames + face_photo) previewed via `URL.createObjectURL`. Force-approve KYC stays API-only — intentionally absent from UI |
| `/admin/purchases` | `AdminPurchasesComponent` | Pappers purchase tracking, retry stuck purchases, **CSV export** button (streamed download with current filters applied) |
| `/admin/free-invoices` | `AdminFreeInvoicesComponent` | Approve/reject `FreeInvoiceRequest`; admin freezes `amount_authorized_ttc` (TTL 30j), strict equality enforced at upload time |

**Zero-manual-intervention policy (2026-04-22)** is respected throughout: no admin action permits revalidating an OCR-rejected document or force-approving a rejected KYC. The contractor must reupload (documents) or restart KYC video (biometrics).

---

## Contractor Feature Components (recent additions)

| Route | Component | Purpose |
|---|---|---|
| `/documents/purchases` | `ContractorPurchasesComponent` | Purchase history + receipt download + refund display (4 KPI cards, refund banner with reassurance copy, no support button when refunded) |
| `/invoices/free` | `ContractorFreeInvoicesComponent` | Free invoices (request creation + PDF upload once admin approved) |
| `/profile` | `ContractorProfileComponent` | Identity (read-only) + email notification preferences (4 toggles + email address input) + logout |

---

## Component Best Practices

### 1. Standalone Components

Use standalone components for better tree-shaking:

```typescript
@Component({
  selector: 'app-my-component',
  standalone: true,
  imports: [CommonModule, MatButtonModule], // Import dependencies
  template: `...`
})
export class MyComponent {}
```

### 2. Dependency Injection

Use `inject()` for services:

```typescript
@Component({ ... })
export class MyComponent {
  private service = inject(MyService); // ✅ Good
  // constructor(private service: MyService) {} // Also acceptable
}
```

### 3. Input/Output Decorators

Use strict typing for inputs and outputs:

```typescript
@Component({ ... })
export class MyComponent {
  @Input() data: UserData; // ✅ Typed
  @Input() isLoading?: boolean; // ✅ Optional
  @Output() dataChange = new EventEmitter<UserData>(); // ✅ Typed
  @Output() cancelled = new EventEmitter<void>(); // ✅ Void event
}
```

### 4. Lifecycle Hooks

Implement lifecycle interfaces for type safety:

```typescript
@Component({ ... })
export class MyComponent implements OnInit, OnDestroy {
  ngOnInit(): void {
    // Initialize component
  }

  ngOnDestroy(): void {
    // Cleanup
  }
}
```

### 5. Change Detection

Use OnPush for better performance:

```typescript
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  ... })
export class MyComponent {}
```

### 6. Memory Management

Always cleanup subscriptions:

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

### 7. Accessibility

Add ARIA labels and keyboard support:

```html
<button mat-icon-button
        [matMenuTriggerFor]="menu"
        aria-label="More options">
  <mat-icon>more_vert</mat-icon>
</button>
```

### 8. Responsive Design

Use flexible layouts:

```typescript
@Component({ ... })
export class MyComponent {
  @Input() breakpoint: 'mobile' | 'tablet' | 'desktop' = 'desktop';
}
```

### 9. Error Handling

Always handle errors gracefully:

```typescript
this.service.getData().subscribe({
  next: (data) => {
    this.data = data;
  },
  error: (error) => {
    this.notificationService.showError(error.message);
  }
});
```

### 10. Loading States

Show loading indicators:

```typescript
@Component({ ... })
export class MyComponent {
  protected readonly loading$ = this.loadingService.loading$;

  loadData() {
    this.loadingService.show();
    this.service.getData().subscribe({
      next: (data) => {
        this.data = data;
        this.loadingService.hide();
      },
      error: (error) => {
        this.loadingService.hide();
      }
    });
  }
}
```

---

## Component Testing

### Unit Testing Example

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('MyComponent', () => {
  let component: MyComponent;
  let fixture: ComponentFixture<MyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyComponent, NoopAnimationsModule],
      providers: [
        { provide: MyService, useValue: mockService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display data', () => {
    component.data = testData;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Expected Text');
  });
});
```

---

## Conclusion

Components in Tuita Compliance follow consistent patterns:
- Standalone architecture
- Type safety
- Performance optimization
- Accessibility
- Responsive design
- Proper lifecycle management
- Memory leak prevention
- Error handling
- Loading states

For questions or contributions, contact the development team.
