# Tuita Compliance - Routing Quick Reference

## Route Structure

```
/ (root)
├── auth/ (public)
│   ├── login
│   ├── register
│   ├── forgot-password
│   └── reset-password
├── dashboard (protected)
├── documents/ (protected)
│   ├── /
│   ├── upload
│   ├── purchases          → ContractorPurchasesComponent (history + refund display)
│   └── :uuid
├── invoices/ (protected)
│   └── free               → ContractorFreeInvoicesComponent (free invoices)
├── companies/ (protected, company/admin)
│   ├── /
│   ├── create
│   └── :uuid
├── employees/ (protected)
│   ├── /
│   ├── create
│   ├── :uuid
│   └── :uuid/kyc
├── settings/ (protected)
│   ├── profile
│   ├── company
│   ├── security
│   ├── notifications
│   └── billing
└── admin/ (admin only — `X-Tuita-Admin-Key` header)
    ├── /                  → ContractorAdminComponent (supervision dashboard)
    ├── invoices           → AdminInvoicesComponent (5 tabs, kebab actions, audit trail)
    ├── settings           → AdminSettingsComponent (platform_settings + reason)
    ├── kyc-failures       → AdminKycFailuresComponent (read-only)
    ├── purchases          → AdminPurchasesComponent (Pappers tracking + CSV export)
    └── free-invoices      → AdminFreeInvoicesComponent (approve/reject)
```

## Common Tasks

### Navigate to a Route
```typescript
// Simple navigation
this.router.navigate(['/dashboard']);

// With UUID parameter
this.router.navigate(['/documents', documentUuid]);

// With query parameters
this.router.navigate(['/documents'], { queryParams: { status: 'pending' }});
```

### Get Current Route
```typescript
// Current URL
this.router.url;

// Current route snapshot
this.activatedRoute.snapshot;

// Observable of route params
this.activatedRoute.params.subscribe(params => {
  const uuid = params['uuid'];
});
```

### Check User Role
```typescript
constructor(private authService: AuthService) {
  this.authService.currentUser$.subscribe(user => {
    this.isAdmin = user?.role === UserRole.ADMIN;
    this.isCompany = user?.role === UserRole.COMPANY;
  });
}
```

### Update Navigation Badge
```typescript
import { updateNavBadge } from './nav-items';

// Update documents badge
updateNavBadge('/documents', pendingCount, 'warning');

// Update verifications badge
updateNavBadge('/admin/verifications', pendingCount, 'error');
```

### Get Navigation Items
```typescript
import { getNavItemsForRole } from './nav-items';

navItems = getNavItemsForRole(UserRole.COMPANY);
```

### Use Breadcrumbs
```typescript
constructor(private breadcrumbService: BreadcrumbService) {
  this.breadcrumbs$ = this.breadcrumbService.getBreadcrumbs();
}

// Update dynamic label
this.breadcrumbService.updateCurrentLabel('Company Name Inc.');
```

## Route Guards

### Apply Guard to Route
```typescript
{
  path: 'admin',
  canActivate: [authGuard, roleGuard([UserRole.ADMIN])],
  component: AdminComponent
}
```

### Available Guards
- `authGuard` - Requires authentication
- `guestGuard` - Redirects authenticated users
- `roleGuard([roles])` - Requires specific role(s)
- `adminGuard()` - Admin only
- `companyGuard()` - Company or Admin
- `employeeGuard()` - Employee, Company, or Admin

## Route Data

### Add Metadata
```typescript
{
  path: 'example',
  component: ExampleComponent,
  title: 'Example Page - Tuita Compliance',
  data: {
    breadcrumb: 'Example > Page',
    icon: 'example-icon',
    animation: 'fade',
    isDetailView: true
  }
}
```

### Access Route Data
```typescript
// In component
constructor(private activatedRoute: ActivatedRoute) {
  this.icon = this.activatedRoute.snapshot.data['icon'];
  this.isDetailView = this.activatedRoute.snapshot.data['isDetailView'];
}
```

## Animations

### Set Route Animation
```typescript
// In route data
data: { animation: 'fade' }

// Available animations:
// - 'slide' (default)
// - 'fade'
// - 'scale'
// - 'slideUp'
// - 'flip'
// - 'none'
```

## UUID Pattern

### Backend Route (Laravel)
```php
Route::get('/documents/{uuid}', DocumentController::show);
```

### Frontend Route (Angular)
```typescript
{
  path: ':uuid',
  component: DocumentDetailComponent
}
```

### Usage
```typescript
// Navigate with UUID
this.router.navigate(['/documents', '550e8400-e29b-41d4-a716-446655440000']);

// Get UUID from route
this.uuid = this.activatedRoute.snapshot.params['uuid'];
```

## Lazy Loading

### Create Lazy Route
```typescript
{
  path: 'example',
  loadComponent: () => import('./pages/example')
    .then(m => m.ExampleComponent)
}
```

### Benefits
- Smaller initial bundle
- Faster page load
- On-demand loading
- Better caching

## Services

### AuthService
```typescript
// Check authentication
this.authService.isAuthenticated$.subscribe(isAuth => {
  // Handle auth state
});

// Get current user
this.authService.currentUser$.subscribe(user => {
  this.role = user?.role;
});

// Login/logout
this.authService.login(credentials).subscribe(...);
this.authService.logout().subscribe(...);
```

### NotificationService
```typescript
// Show notifications
this.notificationService.success('Success message');
this.notificationService.error('Error message');
this.notificationService.warning('Warning message');
this.notificationService.info('Info message');
```

### BreadcrumbService
```typescript
// Get breadcrumbs
this.breadcrumbs$ = this.breadcrumbService.getBreadcrumbs();

// Update current label
this.breadcrumbService.updateCurrentLabel('Dynamic Label');
```

## Common Patterns

### Protected Route
```typescript
{
  path: 'protected',
  canActivate: [authGuard],
  component: ProtectedComponent
}
```

### Admin-Only Route
```typescript
{
  path: 'admin',
  canActivate: [authGuard, roleGuard([UserRole.ADMIN])],
  component: AdminComponent
}
```

### Lazy Loaded Route
```typescript
{
  path: 'feature',
  loadComponent: () => import('./features/feature')
    .then(m => m.FeatureComponent)
}
```

### Route with Children
```typescript
{
  path: 'parent',
  component: ParentComponent,
  children: [
    { path: 'child1', component: Child1Component },
    { path: 'child2', component: Child2Component }
  ]
}
```

### Redirect Route
```typescript
{
  path: 'old-route',
  redirectTo: '/new-route',
  pathMatch: 'full'
}
```

## Troubleshooting

### Route Not Working
1. Check guard permissions
2. Verify UUID format
3. Check lazy loading import
4. Verify route path matches URL
5. Check browser console for errors

### Guard Issues
1. Verify authentication state
2. Check user role
3. Verify guard order
4. Check redirect URL
5. Test guard logic independently

### Lazy Loading Issues
1. Verify import path
2. Check component export
3. Verify module export
4. Check for circular dependencies
5. Test component loads independently

### Animation Issues
1. Verify animation name
2. Check BrowserAnimationsModule
3. Verify route data
4. Test with different animations
5. Check for CSS conflicts

## Best Practices

### DO
- Use UUID pattern for all entity routes
- Apply appropriate guards to protected routes
- Lazy load non-critical routes
- Add route metadata for breadcrumbs
- Use route data for UI configuration
- Test routes with different user roles
- Handle 404 routes gracefully
- Set meaningful page titles

### DON'T
- Use sequential IDs in routes
- Skip guards for "quick" access
- Lazy load critical routes (dashboard, login)
- Hardcode breadcrumb labels
- Ignore route parameters
- Assume user is authenticated
- Leave wildcard route unhandled
- Use generic page titles

## File Locations

```
frontend/src/app/
├── app.routes.ts              # Route definitions
├── app.config.ts              # App configuration
├── nav-items.ts              # Navigation configuration
├── breadcrumb.service.ts     # Breadcrumb service
├── route-animations.ts       # Route animations
├── guards/
│   ├── auth.guard.ts         # Authentication guard
│   ├── guest.guard.ts        # Guest guard
│   └── role.guard.ts         # Role guard
├── pages/
│   ├── index.ts              # Pages barrel export
│   ├── not-found.component.ts
│   └── ...
└── services/
    ├── auth/
    │   └── auth.service.ts
    └── notification.service.ts
```

## Quick Commands

### Add New Route
1. Create component
2. Add to `app.routes.ts`
3. Add to `pages/index.ts`
4. Update breadcrumb config
5. Add nav item (if needed)

### Test Route
```bash
# Navigate to route in browser
http://localhost:4200/documents/uuid-here

# Check routing works
# Test with different user roles
# Verify guards work
# Check lazy loading
```

### Debug Routing
```typescript
// Log route changes
this.router.events.pipe(
  filter(event => event instanceof NavigationEnd)
).subscribe((event: NavigationEnd) => {
  console.log('Route:', event.url);
});
```

## Additional Resources

- Angular Router Docs: https://angular.io/guide/router
- Route Guards: https://angular.io/guide/router#guards
- Lazy Loading: https://angular.io/guide/router#lazy-loading
- Angular Animations: https://angular.io/guide/animations

## Support

For routing issues or questions:
1. Check this guide first
2. Review ROUTING_SETUP.md for details
3. Check Angular documentation
4. Review existing route examples
5. Consult with team
