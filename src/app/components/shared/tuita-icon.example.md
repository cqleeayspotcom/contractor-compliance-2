# Tuita Icon Component Examples

The `TuitaIconComponent` provides a flexible and accessible way to display icons across your Tuita application.

## Basic Usage

### Simple Icon
```html
<tuita-icon icon="home"></tuita-icon>
```

### With Size
```html
<tuita-icon icon="settings" size="sm"></tuita-icon>
<tuita-icon icon="settings" size="md"></tuita-icon>
<tuita-icon icon="settings" size="lg"></tuita-icon>
<tuita-icon icon="settings" size="xl"></tuita-icon>
```

### With Color
```html
<!-- Primary (Tuita blue) -->
<tuita-icon icon="check-circle" color="primary"></tuita-icon>

<!-- Secondary (Tuita green) -->
<tuita-icon icon="check-circle" color="secondary"></tuita-icon>

<!-- Error (Tuita orange) -->
<tuita-icon icon="error" color="error"></tuita-icon>

<!-- Success -->
<tuita-icon icon="verified" color="success"></tuita-icon>
```

### Interactive Icons
```html
<!-- Clickable icon with hover effects -->
<tuita-icon icon="edit" clickable (click)="editItem()"></tuita-icon>

<!-- Spinning icon (loading state) -->
<tuita-icon icon="refresh" spin></tuita-icon>

<!-- Pulsing icon (attention-grabbing) -->
<tuita-icon icon="notifications" pulse></tuita-icon>
```

### Transformed Icons
```html
<!-- Rotated -->
<tuita-icon icon="arrow-up" rotate="90"></tuita-icon>
<tuita-icon icon="arrow-up" rotate="180"></tuita-icon>
<tuita-icon icon="arrow-up" rotate="270"></tuita-icon>

<!-- Flipped -->
<tuita-icon icon="arrow-back" flipHorizontal></tuita-icon>
<tuita-icon icon="arrow-up" flipVertical></tuita-icon>
```

### Disabled State
```html
<tuita-icon icon="delete" disabled></tuita-icon>
```

### Custom Styling
```html
<!-- With custom CSS class -->
<tuita-icon icon="star" class="my-custom-class"></tuita-icon>

<!-- With multiple options -->
<tuita-icon
  icon="check-circle"
  size="lg"
  color="success"
  clickable
  (click)="confirmAction()">
</tuita-icon>
```

## Available Icons

### Navigation
- `home`, `dashboard`, `documents`, `employees`, `settings`, `profile`, `notifications`
- `search`, `menu`, `close`, `arrow-back`, `arrow-forward`, `arrow-up`, `arrow-down`
- `chevron-left`, `chevron-right`, `chevron-up`, `chevron-down`
- `expand-more`, `expand-less`

### Actions
- `add`, `edit`, `delete`, `save`, `cancel`, `check`, `close-circle`
- `refresh`, `download`, `upload`, `filter`, `sort`
- `more-vert`, `more-horiz`, `visibility`, `visibility-off`
- `lock`, `unlock`, `email`, `phone`, `location`, `calendar`, `clock`

### Status
- `check-circle`, `check-circle-outline`, `error`, `error-outline`
- `warning`, `info`, `info-outline`, `help`, `help-outline`
- `verified`, `pending`, `hourglass-empty`, `hourglass-full`

### Documents
- `description`, `folder`, `folder-open`, `attach-file`
- `picture-as-pdf`, `image`, `insert-drive-file`, `text-snippet`
- `receipt`, `invoice`, `contract`, `id-card`, `badge`

### Business
- `business`, `company`, `building`, `store`
- `account-balance`, `credit-card`, `payment`
- `euro`, `euro-symbol`, `account-balance-wallet`, `savings`
- `trending-up`, `trending-down`, `show-chart`, `bar-chart`, `pie-chart`
- `assessment`, `analytics`, `insights`, `statistics`

### Users
- `person`, `person-outline`, `people`, `people-outline`
- `group`, `group-add`, `person-add`, `supervisor-account`
- `admin-panel-settings`, `manage-accounts`, `verified-user`
- `security`, `shield`, `key`, `vpn-key`

### Communication
- `mail`, `mail-outline`, `send`, `message`, `chat`
- `chat-bubble`, `chat-bubble-outline`, `forum`
- `announcement`, `campaign`, `notifications-active`, `notifications-none`

### Tools & Settings
- `settings`, `settings-outline`, `tune`, `build`, `handyman`
- `construction`, `engineering`, `science`, `biotech`
- `medical-services`, `health-and-safety`, `workspace-premium`

### Legal & Compliance
- `gavel`, `balance`, `policy`, `copyright`
- `fact-check`, `task-alt`, `rule`
- `menu-book`, `library-books`, `article`

### Misc
- `star`, `star-outline`, `star-border`
- `favorite`, `favorite-border`, `bookmark`, `bookmark-border`
- `label`, `label-outline`, `tag`, `local-offer`
- `link`, `link-off`, `share`, `print`
- `qr-code`, `qr-code-scanner`
- `fullscreen`, `fullscreen-exit`

### Logo
- `logo-tuita`, `logo-tuita-icon`

## Accessibility

All icons automatically get ARIA labels for screen readers. By default, the icon name is used as the label.

```html
<!-- Custom ARIA label -->
<tuita-icon icon="delete" ariaLabel="Delete document"></tuita-icon>
```

## TypeScript Usage

```typescript
import { Component } from '@angular/core';
import { TuitaIconComponent } from './components/shared';

@Component({
  selector: 'app-my-component',
  template: `
    <tuita-icon [icon]="currentIcon" [size]="iconSize"></tuita-icon>
    <button (click)="toggleIcon()">
      <tuita-icon icon="refresh" [spin]="isLoading"></tuita-icon>
      {{ isLoading ? 'Loading...' : 'Refresh' }}
    </button>
  `,
  standalone: true,
  imports: [TuitaIconComponent]
})
export class MyComponent {
  currentIcon: IconName = 'home';
  iconSize: IconSize = 'md';
  isLoading = false;

  toggleIcon() {
    this.currentIcon = this.currentIcon === 'home' ? 'settings' : 'home';
  }

  refresh() {
    this.isLoading = true;
    // Simulate API call
    setTimeout(() => {
      this.isLoading = false;
    }, 2000);
  }
}
```

## Design Tokens

The icon component uses Tuita's design tokens:

### Sizes
- `sm`: 16px (0.5rem) - Small icons for buttons, lists
- `md`: 24px (0.75rem) - Medium icons for standard use
- `lg`: 32px (1rem) - Large icons for emphasis
- `xl`: 48px (1.5rem) - Extra large icons for hero sections

### Colors
- `primary`: #073148 (Tuita blue)
- `secondary`: #04A777 (Tuita green)
- `error`: #F75C03 (Tuita orange)
- `warning`: #F75C03 (Tuita orange)
- `info`: #073148 (Tuita blue)
- `success`: #04A777 (Tuita green)
- `light`: #8d98a7 (Light grey)
- `lighter`: #adb5c0 (Lighter grey)
- `muted`: #cdd3da (Muted grey)
