# Angular Environment Configuration Guide

## Overview

This document explains how to configure and use environments in the Tuita Compliance Angular application.

## Environment Files

The application uses different environment files for various deployment scenarios:

- `src/environments/environment.ts` - Development environment
- `src/environments/environment.prod.ts` - Production environment
- `src/environments/environment.local.ts` - Local overrides (optional, git-ignored)

## Configuration Structure

Each environment file exports an object with the following structure:

```typescript
export const environment = {
  production: boolean;           // Production mode flag
  apiUrl: string;                // Backend API URL
  frontendUrl: string;           // Frontend URL for CORS
  stripe: {
    publishableKey: string;      // Stripe publishable key
  };
  features: {
    enableMockData: boolean;     // Enable mock services
    enableDebugMode: boolean;    // Enable debug logging
    enableAnalytics: boolean;    // Enable analytics tracking
  };
  pagination: {
    defaultPageSize: number;
    pageSizeOptions: number[];
  };
  upload: {
    maxFileSize: number;         // Max file size in bytes
    allowedFileTypes: string[];  // Allowed MIME types
  };
  session: {
    warningDuration: number;     // Time before token expiry to show warning (ms)
    refreshThreshold: number;    // Time before expiry to attempt refresh (ms)
  };
};
```

## Development Environment

Located in `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  frontendUrl: 'http://localhost:4200',
  stripe: {
    publishableKey: 'pk_test_your_stripe_key_here'
  },
  features: {
    enableMockData: false,
    enableDebugMode: true,
    enableAnalytics: false
  },
  // ... other configuration
};
```

## Production Environment

Located in `src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: '/api', // Relative path for production
  frontendUrl: 'https://your-domain.com',
  stripe: {
    publishableKey: 'pk_live_your_stripe_key_here'
  },
  features: {
    enableMockData: false,
    enableDebugMode: false,
    enableAnalytics: true
  },
  // ... other configuration
};
```

## Local Overrides

For local development, you can create `src/environments/environment.local.ts` to override specific settings:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
  // Override only what you need
};
```

**Note**: This file is git-ignored by default.

## Using Environment Variables in Code

### Import the Environment

```typescript
import { environment } from '../../../environments/environment';

@Component({
  // ...
})
export class MyComponent {
  constructor() {
    console.log('API URL:', environment.apiUrl);
    console.log('Debug mode:', environment.features.enableDebugMode);
  }
}
```

### Feature Flags

Check feature flags before executing code:

```typescript
if (environment.features.enableDebugMode) {
  console.debug('Debug information:', data);
}

if (environment.features.enableAnalytics) {
  // Track analytics event
}
```

### Conditional Imports

Use environment to conditionally import modules:

```typescript
import { environment } from '../../../environments/environment';

// In app.config.ts or component
if (environment.production) {
  // Production-only initialization
} else {
  // Development-only initialization
}
```

## Build Configuration

### Development Build

```bash
ng build --configuration development
```

This uses `environment.ts` (or `environment.local.ts` if exists).

### Production Build

```bash
ng build --configuration production
```

This uses `environment.prod.ts`.

### Custom Environment

You can create additional environments in `angular.json`:

```json
"configurations": {
  "staging": {
    "fileReplacements": [
      {
        "replace": "src/environments/environment.ts",
        "with": "src/environments/environment.staging.ts"
      }
    ]
  }
}
```

## API URL Configuration

### Development
- Uses full URL: `http://localhost:8000/api`
- Proxy configuration in `proxy.conf.json` handles CORS

### Production
- Uses relative path: `/api`
- Nginx/Apache handles proxy to backend

## Stripe Configuration

### Test Mode (Development)
```typescript
stripe: {
  publishableKey: 'pk_test_...'
}
```

### Live Mode (Production)
```typescript
stripe: {
  publishableKey: 'pk_live_...'
}
```

## Feature Flags

### enableMockData
When enabled, uses mock services instead of real API:
```typescript
features: {
  enableMockData: true // Use mock services
}
```

### enableDebugMode
Enables detailed console logging:
```typescript
features: {
  enableDebugMode: true // Show debug logs
}
```

### enableAnalytics
Enables analytics tracking (Google Analytics, etc.):
```typescript
features: {
  enableAnalytics: true // Track user actions
}
```

## File Upload Configuration

```typescript
upload: {
  maxFileSize: 10485760, // 10MB in bytes
  allowedFileTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png'
  ]
}
```

## Session Configuration

```typescript
session: {
  warningDuration: 300000,  // 5 minutes - show warning before token expires
  refreshThreshold: 900000  // 15 minutes - attempt token refresh
}
```

## Pagination Configuration

```typescript
pagination: {
  defaultPageSize: 25,
  pageSizeOptions: [10, 25, 50, 100]
}
```

## Security Best Practices

1. **Never commit sensitive keys** to environment files
2. **Use environment variables** for secrets in production
3. **Git-ignore local overrides**: `environment.local.ts`
4. **Validate configuration** at application startup
5. **Use different keys** for development and production

## Troubleshooting

### API Connection Issues

If API calls fail in development:
1. Check `apiUrl` in environment file
2. Verify proxy configuration in `proxy.conf.json`
3. Ensure backend is running on correct port
4. Check browser console for CORS errors

### Stripe Issues

If Stripe integration fails:
1. Verify publishable key matches environment (test/live)
2. Check Stripe dashboard for API key status
3. Ensure CORS is configured in Stripe dashboard

### Environment Not Updating

If changes to environment files don't take effect:
1. Restart the dev server: `ng serve`
2. Clear browser cache
3. Check for cached environment files
4. Verify correct build configuration

## Migration from Older Angular Versions

If migrating from Angular < 17:

1. **Old way** (deprecated):
```typescript
import { environment } from './environments/environment';
```

2. **New way** (Angular 17+):
```typescript
import { environment } from '../../../environments/environment';
```

The path is now relative to the component location.

## Testing with Different Environments

### Unit Tests

Mock environment in tests:

```typescript
import { environment } from '../../../environments/environment';

jest.mock('../../../environments/environment', () => ({
  environment: {
    production: false,
    apiUrl: 'http://test-api',
    // ... other properties
  }
}));
```

### E2E Tests

Use different environment for E2E:

```bash
ng e2e --configuration production
```

## Conclusion

Proper environment configuration ensures:
- Smooth development workflow
- Secure production deployments
- Easy testing across environments
- Clear separation of concerns

For questions or issues, contact the development team.
