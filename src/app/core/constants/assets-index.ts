/**
 * Asset Paths Index
 * Centralized location for all image, icon, and logo paths
 * This makes it easier to update paths across the application
 */

export const ASSETS = {
  // Main Tuita logos (for app header, landing page, etc.)
  logos: {
    // Primary Tuita logo (full text + icon)
    primary: 'assets/logos/logo-tuita.svg',
    primary2x: 'assets/logos/logo-tuita@2x.png',
    primary3x: 'assets/logos/logo-tuita@3x.png',
    primaryPdf: 'assets/logos/logo-tuita.pdf',

    // White version (for dark backgrounds)
    white: 'assets/logos/logo-tuita-white.svg',
    white1x: 'assets/logos/logo-tuita-white@1x.png',
    white2x: 'assets/logos/logo-tuita-white@2x.png',
    white3x: 'assets/logos/logo-tuita-white@3x.png',

    // Icon-only versions
    icon: 'assets/logos/logo-tuita-icon.svg',
    iconPng: 'assets/logos/logo-tuita-icon.png',
    icon2x: 'assets/logos/logo-tuita-icon@2x.png',
    icon3x: 'assets/logos/logo-tuita-icon@3x.png',
    icon4x: 'assets/logos/logo-tuita-icon@4x.png',
    icon0_5x: 'assets/logos/logo-tuita-icon@0.5x.png',
    iconPdf: 'assets/logos/logo-tuita-icon.pdf',

    // Vimeo-style icon
    vimeoIcon: 'assets/logos/logo-tuita-icon-vimeo.svg',
    vimeoIconPng: 'assets/logos/logo-tuita-icon-vimeo.png',
    vimeoIcon2x: 'assets/logos/logo-tuita-icon-vimeo@2x.png',
    vimeoIcon3x: 'assets/logos/logo-tuita-icon-vimeo@3x.png',
    vimeoIconPdf: 'assets/logos/logo-tuita-icon-vimeo.pdf',

    // Grey icon variant
    iconGrey: 'assets/logos/logo-tuita-icon-grey.svg',
    iconGrey2x: 'assets/logos/logo-tuita-icon-grey@2x.png',

    // Orange icon variant (high resolution)
    iconOrange4x: 'assets/logos/logo-tuita-icon-orange@4x.png',

    // Front icon variant
    iconFront: 'assets/logos/logo-icon-front.svg',

    // Background-only
    bg: 'assets/logos/logo-tuita-bg.svg',

    // Alternative branding
    tuitaBadge: 'assets/logos/tuita-badge.stl',
    tuitaGoogle: 'assets/logos/tuita-google.jpg',
    tuitaSimple: 'assets/logos/tuita.svg',

    // Dialog/partner logo
    dlg: 'assets/logos/logo-dlg.png',
  },

  // Favicons (for browser tabs)
  favicons: {
    android192: 'assets/favicons/android-chrome-192x192.png',
    android512: 'assets/favicons/android-chrome-512x512.png',
  },

  // Commonly used aliases for quick access
  header: 'assets/logos/logo-tuita.svg',
  headerWhite: 'assets/logos/logo-tuita-white.svg',
  iconSmall: 'assets/logos/logo-tuita-icon.svg',
  iconLarge: 'assets/logos/logo-tuita-icon@2x.png',
  favicon: 'assets/favicons/android-chrome-192x192.png',
};

/**
 * Helper function to get responsive logo sources
 * Usage: <img [src]="getResponsiveLogo('primary')" [srcset]="getResponsiveSrcSet('primary')">
 */
export function getResponsiveSrcSet(logoType: keyof typeof ASSETS.logos): string {
  const logoMap: Record<string, string[]> = {
    primary: [
      `${ASSETS.logos.primary} 1x`,
      `${ASSETS.logos.primary2x} 2x`,
      `${ASSETS.logos.primary3x} 3x`,
    ],
    white: [
      `${ASSETS.logos.white} 1x`,
      `${ASSETS.logos.white2x} 2x`,
      `${ASSETS.logos.white3x} 3x`,
    ],
    icon: [
      `${ASSETS.logos.iconPng} 1x`,
      `${ASSETS.logos.icon2x} 2x`,
      `${ASSETS.logos.icon3x} 3x`,
      `${ASSETS.logos.icon4x} 4x`,
    ],
    vimeo: [
      `${ASSETS.logos.vimeoIconPng} 1x`,
      `${ASSETS.logos.vimeoIcon2x} 2x`,
      `${ASSETS.logos.vimeoIcon3x} 3x`,
    ],
    iconGrey: [
      `${ASSETS.logos.iconGrey} 1x`,
      `${ASSETS.logos.iconGrey2x} 2x`,
    ],
  };

  return (logoMap[logoType] || []).join(', ');
}

/**
 * Get logo based on theme (light/dark)
 */
export function getThemedLogo(isDarkMode = false): string {
  return isDarkMode ? ASSETS.logos.white : ASSETS.logos.primary;
}

/**
 * Get icon based on theme (light/dark)
 */
export function getThemedIcon(isDarkMode = false): string {
  return isDarkMode ? ASSETS.logos.icon : ASSETS.logos.iconGrey;
}
