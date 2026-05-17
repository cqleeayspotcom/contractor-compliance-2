# Tuita Assets

This directory contains all Tuita branding assets including logos, icons, and favicons.

## Directory Structure

```
assets/
├── favicons/           # Browser favicons for different sizes
├── icons/              # UI icons (TBD - add your UI icons here)
├── logos/              # All Tuita logo variations
├── logo-tuita-icon.svg # Icon-only logo (quick access)
├── logo-tuita.svg      # Full logo (quick access)
└── tuita.svg          # Simplified logo
```

## Usage in Components

### Import the Assets Constant

```typescript
import { ASSETS, getThemedLogo, getThemedIcon } from '@/core/constants/assets-index';
```

### Using in Templates

**Basic logo usage:**
```html
<img [src]="ASSETS.header" alt="Tuita Compliance">
```

**Theme-aware logo:**
```typescript
export class HeaderComponent {
  isDarkMode = false; // Your theme logic

  get logoPath() {
    return getThemedLogo(this.isDarkMode);
  }
}
```

```html
<img [src]="logoPath" alt="Tuita Compliance">
```

**Responsive logo with srcset:**
```html
<img
  [src]="ASSETS.logos.primary"
  [srcset]="getResponsiveSrcSet('primary')"
  alt="Tuita Compliance">
```

## Available Logo Variants

### Primary Logos (Full text + icon)
- `ASSETS.logos.primary` - SVG (recommended for most uses)
- `ASSETS.logos.primary2x` - 2x PNG
- `ASSETS.logos.primary3x` - 3x PNG

### White Logos (For dark backgrounds)
- `ASSETS.logos.white` - SVG
- `ASSETS.logos.white2x` - 2x PNG
- `ASSETS.logos.white3x` - 3x PNG

### Icon-Only Logos
- `ASSETS.logos.icon` - SVG (recommended)
- `ASSETS.logos.iconPng` - PNG
- `ASSETS.logos.icon2x` - 2x PNG
- `ASSETS.logos.icon3x` - 3x PNG

### Special Variants
- `ASSETS.logos.iconGrey` - Grey icon variant
- `ASSETS.logos.vimeoIcon` - Vimeo-style icon
- `ASSETS.logos.iconFront` - Front icon variant
- `ASSETS.logos.bg` - Background-only

### Quick Aliases
For convenience, use these pre-defined paths:
- `ASSETS.header` - Main header logo
- `ASSETS.headerWhite` - White header logo (dark mode)
- `ASSETS.iconSmall` - Small icon
- `ASSETS.iconLarge` - Large icon
- `ASSETS.favicon` - Default favicon

## Theme Helper Functions

### `getThemedLogo(isDarkMode: boolean): string`
Returns the appropriate logo based on theme:
- Light mode: Full color logo
- Dark mode: White logo

### `getThemedIcon(isDarkMode: boolean): string`
Returns the appropriate icon based on theme:
- Light mode: Grey icon
- Dark mode: Full color icon

### `getResponsiveSrcSet(logoType: string): string`
Generates responsive srcset for high-DPI displays.

Supported types:
- `'primary'` - Full logo (1x, 2x, 3x)
- `'white'` - White logo (1x, 2x, 3x)
- `'icon'` - Icon (1x, 2x, 3x, 4x)
- `'vimeo'` - Vimeo icon (1x, 2x, 3x)
- `'iconGrey'` - Grey icon (1x, 2x)

## Favicons

Favicons are configured in `angular.json` and `src/index.html`:

```typescript
// Available favicon paths
ASSETS.favicons.android192  // 192x192 PNG
ASSETS.favicons.android512  // 512x512 PNG
```

## Best Practices

1. **Use SVG when possible** - Better quality and smaller file size
2. **Use helper functions** for theme-aware logos
3. **Provide alt text** for accessibility
4. **Consider responsive images** for high-DPI displays
5. **Use appropriate variants** (white on dark backgrounds)

## Example: Header Component

```typescript
import { Component } from '@angular/core';
import { ASSETS, getThemedLogo } from '@/core/constants/assets-index';

@Component({
  selector: 'app-header',
  template: `
    <header class="app-header">
      <a [routerLink]="['/']" class="logo-link">
        <img
          [src]="currentLogo"
          alt="Tuita Compliance"
          class="app-logo">
      </a>
    </header>
  `,
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  ASSETS = ASSETS;
  isDarkMode = false;

  get currentLogo(): string {
    return getThemedLogo(this.isDarkMode);
  }
}
```

## Adding New Assets

To add new assets:
1. Place the file in the appropriate subdirectory (`logos/`, `icons/`, etc.)
2. Add the path to `ASSETS` constant in `src/app/core/constants/assets-index.ts`
3. Optionally add helper functions if needed
4. Update this README with usage examples

## File Formats

- **SVG** - Preferred for logos and icons (scalable)
- **PNG** - Use for favicons and when transparency is needed
- **PDF** - Print materials and documents
- **STL** - 3D printing (tuita-badge.stl)

## Color References

The Tuita brand uses these primary colors:
- Dark Blue: #073148 (primary)
- Orange: #FF6B35 (accent)
- White: #FFFFFF (for dark backgrounds)

These colors are defined in the theme styles and should be used consistently across the application.
