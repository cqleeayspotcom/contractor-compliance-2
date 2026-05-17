const fs = require('fs');
const path = require('path');

// Mapping from class name to sub-package
const materialMap = {
  'MatCardModule': '@angular/material/card',
  'MatCard': '@angular/material/card',
  'MatCardContent': '@angular/material/card',
  'MatCardTitle': '@angular/material/card',
  'MatCardSubtitle': '@angular/material/card',
  'MatCardTitleGroup': '@angular/material/card',
  'MatCardHeader': '@angular/material/card',
  'MatCardImage': '@angular/material/card',
  'MatCardActions': '@angular/material/card',
  'MatCardFooter': '@angular/material/card',
  'MatProgressSpinnerModule': '@angular/material/progress-spinner',
  'MatSpinner': '@angular/material/progress-spinner',
  'MatProgressBarModule': '@angular/material/progress-bar',
  'MatIconModule': '@angular/material/icon',
  'MatIcon': '@angular/material/icon',
  'MatButtonModule': '@angular/material/button',
  'MatButton': '@angular/material/button',
  'MatIconButton': '@angular/material/button',
  'MatInputModule': '@angular/material/input',
  'MatInput': '@angular/material/input',
  'MatSelectModule': '@angular/material/select',
  'MatSelect': '@angular/material/select',
  'MatFormFieldModule': '@angular/material/form-field',
  'MatFormField': '@angular/material/form-field',
  'MatLabel': '@angular/material/form-field',
  'MatError': '@angular/material/form-field',
  'MatHint': '@angular/material/form-field',
  'MatPrefix': '@angular/material/form-field',
  'MatSuffix': '@angular/material/form-field',
  'MatPaginatorModule': '@angular/material/paginator',
  'MatPaginator': '@angular/material/paginator',
  'PageEvent': '@angular/material/paginator',
  'MatTooltipModule': '@angular/material/tooltip',
  'MatTooltip': '@angular/material/tooltip',
  'MatChipsModule': '@angular/material/chips',
  'MatChip': '@angular/material/chips',
  'MatChipSet': '@angular/material/chips',
  'MatBadgeModule': '@angular/material/badge',
  'MatBadge': '@angular/material/badge',
  'MatMenuModule': '@angular/material/menu',
  'MatMenu': '@angular/material/menu',
  'MatMenuItem': '@angular/material/menu',
  'MatMenuTrigger': '@angular/material/menu',
  'MatStepperModule': '@angular/material/stepper',
  'MatStepper': '@angular/material/stepper',
  'MatStep': '@angular/material/stepper',
  'MatStepLabel': '@angular/material/stepper',
  'MatTabsModule': '@angular/material/tabs',
  'MatTab': '@angular/material/tabs',
  'MatTabGroup': '@angular/material/tabs',
  'MatDividerModule': '@angular/material/divider',
  'MatDivider': '@angular/material/divider',
  'MatTableModule': '@angular/material/table',
  'MatTable': '@angular/material/table',
  'MatColumnDef': '@angular/material/table',
  'MatHeaderCell': '@angular/material/table',
  'MatCell': '@angular/material/table',
  'MatHeaderRow': '@angular/material/table',
  'MatRow': '@angular/material/table',
  'MatSortModule': '@angular/material/sort',
  'MatSort': '@angular/material/sort',
  'MatSortHeader': '@angular/material/sort',
  'MatCheckboxModule': '@angular/material/checkbox',
  'MatCheckbox': '@angular/material/checkbox',
  'MatDialog': '@angular/material/dialog',
  'MatDialogModule': '@angular/material/dialog',
  'MatDialogRef': '@angular/material/dialog',
  'MatDialogConfig': '@angular/material/dialog',
  'MAT_DIALOG_DATA': '@angular/material/dialog',
  'MatSlideToggleModule': '@angular/material/slide-toggle',
  'MatSlideToggle': '@angular/material/slide-toggle',
  'MatSnackBar': '@angular/material/snack-bar',
  'MatSnackBarModule': '@angular/material/snack-bar',
};

function fixMaterialImports(content) {
  // Match multi-line import blocks from '@angular/material'
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*'@angular\/material';/g;

  let match;
  const replacements = [];

  while ((match = importPattern.exec(content)) !== null) {
    const fullMatch = match[0];
    const importsStr = match[1];

    // Parse individual imports
    const imports = importsStr
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Group by target package
    const byPackage = {};
    const unmapped = [];

    for (const imp of imports) {
      const name = imp.split(/\s+as\s+/)[0].trim();
      const pkg = materialMap[name];
      if (pkg) {
        if (!byPackage[pkg]) byPackage[pkg] = [];
        byPackage[pkg].push(imp);
      } else {
        unmapped.push(imp);
        console.warn('  WARNING: No mapping for ' + name);
      }
    }

    // Build replacement imports
    const newImports = Object.entries(byPackage)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pkg, names]) => {
        if (names.length === 1) {
          return 'import { ' + names[0] + " } from '" + pkg + "';";
        }
        return 'import {\n  ' + names.join(',\n  ') + "\n} from '" + pkg + "';";
      });

    if (unmapped.length > 0) {
      console.warn('  Unmapped: ' + unmapped.join(', '));
    }

    replacements.push({ from: fullMatch, to: newImports.join('\n') });
  }

  for (const r of replacements) {
    content = content.replace(r.from, r.to);
  }

  return content;
}

function fixRelativePaths(content, relPath) {
  // For files in pages/companies/*/  or pages/employees/*/ (extra subdirectory level)
  const isDeepSubdir = /pages\/(companies|employees)\/.+\//.test(relPath);

  if (isDeepSubdir) {
    content = content.replace(
      /from '\.\.\/\.\.\/services\/mock\//g,
      "from '../../../services/mock/"
    );
    content = content.replace(
      /from '\.\.\/\.\.\/components\/shared\//g,
      "from '../../../components/shared/"
    );
    content = content.replace(
      /from '\.\.\/\.\.\/models'/g,
      "from '../../../models'"
    );
  }

  return content;
}

const rootDir = 'C:/Users/mouss/Desktop/tuita/tuita-verify/frontend/src/app';
const files = [
  'pages/companies/companies-list/companies-list.component.ts',
  'pages/companies/company-create/company-create.component.ts',
  'pages/companies/company-detail/company-detail.component.ts',
  'pages/employees/employees-list.component.ts',
  'pages/employees/employee-create.component.ts',
  'pages/employees/employee-detail.component.ts',
  'pages/employees/employee-kyc.component.ts',
  'pages/dashboard/dashboard.component.ts',
  'pages/settings/settings.component.ts',
  'pages/settings/settings-profile.component.ts',
  'pages/settings/settings-company.component.ts',
  'pages/settings/settings-security.component.ts',
  'pages/settings/settings-notifications.component.ts',
  'pages/settings/settings-billing.component.ts',
  'pages/admin/admin-dashboard.component.ts',
  'pages/admin/admin-companies.component.ts',
  'pages/admin/admin-users.component.ts',
  'pages/admin/admin-verifications.component.ts',
  'pages/admin/admin-system.component.ts',
];

for (const relPath of files) {
  const fullPath = path.resolve(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log('SKIP (not found): ' + fullPath);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;

  console.log('Processing: ' + relPath);
  content = fixMaterialImports(content);
  content = fixRelativePaths(content, relPath);

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('  -> Fixed');
  } else {
    console.log('  -> No changes');
  }
}

console.log('\nDone!');
