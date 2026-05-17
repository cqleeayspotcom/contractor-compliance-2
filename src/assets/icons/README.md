# PWA Icons for Tuita Compliance

This directory should contain PWA icons in the following sizes:
- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png
- icon-384x384.png
- icon-512x512.png

## Icon Generation

To generate PWA icons from a source logo, you can use one of these methods:

### Using ImageMagick CLI

```bash
# Replace /path/to/source-logo.svg with your actual logo path
convert /path/to/source-logo.svg -resize 72x72 icon-72x72.png
convert /path/to/source-logo.svg -resize 96x96 icon-96x96.png
convert /path/to/source-logo.svg -resize 128x128 icon-128x128.png
convert /path/to/source-logo.svg -resize 144x144 icon-144x144.png
convert /path/to/source-logo.svg -resize 152x152 icon-152x152.png
convert /path/to/source-logo.svg -resize 192x192 icon-192x192.png
convert /path/to/source-logo.svg -resize 384x384 icon-384x384.png
convert /path/to/source-logo.svg -resize 512x512 icon-512x512.png
```

### Using Online Tools

1. **PWA Asset Generator**: https://www.pwabuilder.com/imageGenerator
2. **RealFaviconGenerator**: https://realfavicongenerator.net/
3. **Favicon.io**: https://favicon.io/

### Using Node.js Package

```bash
npm install -g pwa-asset-generator
pwa-asset-generator /path/to/source-logo.png ./src/assets/icons --manifest ./src/manifest.webmanifest
```

## Branding Guidelines

- **Primary Color**: #073148 (Tuita Blue)
- **Background**: White or transparent
- **Style**: Clean, professional, suitable for business/enterprise
- **Minimum safe area**: Ensure logo is centered with appropriate padding

## Icon Requirements

- Format: PNG with transparency support
- Background: Transparent preferred for better adaptability
- Quality: High resolution, crisp edges at all sizes
- Content: Tuita logo or "TV" monogram for small sizes
