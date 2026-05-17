const fs = require('fs');
const path = require('path');

// Mapping from element/directive to module
const elementToModule = {
  'mat-divider': { module: 'MatDividerModule', pkg: '@angular/material/divider' },
  'mat-option': { module: 'MatOption', pkg: '@angular/material/core' },
  'mat-select': { module: 'MatSelectModule', pkg: '@angular/material/select' },
  'mat-paginator': { module: 'MatPaginatorModule', pkg: '@angular/material/paginator' },
  'mat-progress-bar': { module: 'MatProgressBarModule', pkg: '@angular/material/progress-bar' },
  'mat-progress-spinner': { module: 'MatProgressSpinnerModule', pkg: '@angular/material/progress-spinner' },
  'mat-spinner': { module: 'MatProgressSpinnerModule', pkg: '@angular/material/progress-spinner' },
  'mat-card': { module: 'MatCardModule', pkg: '@angular/material/card' },
  'mat-icon': { module: 'MatIconModule', pkg: '@angular/material/icon' },
  'mat-button': { module: 'MatButtonModule', pkg: '@angular/material/button' },
  'mat-menu': { module: 'MatMenuModule', pkg: '@angular/material/menu' },
  'mat-table': { module: 'MatTableModule', pkg: '@angular/material/table' },
  'mat-row': { module: 'MatTableModule', pkg: '@angular/material/table' },
  'mat-header-row': { module: 'MatTableModule', pkg: '@angular/material/table' },
  'mat-column-def': { module: 'MatTableModule', pkg: '@angular/material/table' },
  'mat-chip': { module: 'MatChipsModule', pkg: '@angular/material/chips' },
  'mat-chip-set': { module: 'MatChipsModule', pkg: '@angular/material/chips' },
  'mat-tab': { module: 'MatTabsModule', pkg: '@angular/material/tabs' },
  'mat-tab-group': { module: 'MatTabsModule', pkg: '@angular/material/tabs' },
  'mat-form-field': { module: 'MatFormFieldModule', pkg: '@angular/material/form-field' },
  'mat-label': { module: 'MatFormFieldModule', pkg: '@angular/material/form-field' },
  'mat-error': { module: 'MatFormFieldModule', pkg: '@angular/material/form-field' },
  'mat-hint': { module: 'MatFormFieldModule', pkg: '@angular/material/form-field' },
  'mat-slide-toggle': { module: 'MatSlideToggleModule', pkg: '@angular/material/slide-toggle' },
  'mat-checkbox': { module: 'MatCheckboxModule', pkg: '@angular/material/checkbox' },
  'mat-stepper': { module: 'MatStepperModule', pkg: '@angular/material/stepper' },
  'mat-step': { module: 'MatStepperModule', pkg: '@angular/material/stepper' },
  'router-outlet': { module: 'RouterModule', pkg: '@angular/router' },
};

// Directives/bindings that need specific modules
const directiveToModule = {
  'routerLink': { module: 'RouterModule', pkg: '@angular/router' },
  'routerLinkActive': { module: 'RouterModule', pkg: '@angular/router' },
  'ngIf': { module: 'CommonModule', pkg: '@angular/common' },
  'ngFor': { module: 'CommonModule', pkg: '@angular/common' },
  'ngClass': { module: 'CommonModule', pkg: '@angular/common' },
  'ngSwitch': { module: 'CommonModule', pkg: '@angular/common' },
  'ngModel': { module: 'FormsModule', pkg: '@angular/forms' },
  'matTooltip': { module: 'MatTooltipModule', pkg: '@angular/material/tooltip' },
  'matMenuTriggerFor': { module: 'MatMenuModule', pkg: '@angular/material/menu' },
};

const rootDir = 'C:/Users/mouss/Desktop/tuita/tuita-verify/frontend/src/app';

const files = [
  'pages/employees/employees-list.component.ts',
  'pages/employees/employee-create.component.ts',
  'pages/employees/employee-detail.component.ts',
  'pages/employees/employee-kyc.component.ts',
  'pages/settings/settings-profile.component.ts',
  'pages/settings/settings-company.component.ts',
  'pages/settings/settings-security.component.ts',
  'pages/settings/settings-notifications.component.ts',
  'pages/settings/settings-billing.component.ts',
  'pages/settings/settings.component.ts',
  'pages/companies/companies-list/companies-list.component.ts',
  'pages/companies/company-create/company-create.component.ts',
  'pages/companies/company-detail/company-detail.component.ts',
  'pages/admin/admin-dashboard.component.ts',
  'pages/admin/admin-companies.component.ts',
  'pages/admin/admin-users.component.ts',
  'pages/admin/admin-verifications.component.ts',
  'pages/admin/admin-system.component.ts',
  'pages/dashboard/dashboard.component.ts',
];

function getHtmlFile(tsFile) {
  const dir = path.dirname(tsFile);
  const base = path.basename(tsFile, '.ts');

  // Read the .ts file to find templateUrl
  const content = fs.readFileSync(tsFile, 'utf8');
  const templateMatch = content.match(/templateUrl:\s*'([^']+)'/);
  if (templateMatch) {
    return path.resolve(dir, templateMatch[1]);
  }
  return null;
}

function checkHtmlForMissingModules(htmlFile, currentImports) {
  if (!fs.existsSync(htmlFile)) return {};

  const html = fs.readFileSync(htmlFile, 'utf8');
  const missing = {};

  // Check for element usage
  for (const [element, info] of Object.entries(elementToModule)) {
    if (html.includes('<' + element) && !currentImports.includes(info.module)) {
      missing[info.module] = info.pkg;
    }
  }

  // Check for directive usage
  for (const [directive, info] of Object.entries(directiveToModule)) {
    if ((html.includes('[' + directive + ']') || html.includes('*' + directive) || html.includes('(' + directive))
        && !currentImports.includes(info.module)) {
      missing[info.module] = info.pkg;
    }
  }

  return missing;
}

function addModulesToImports(content, missingModules) {
  if (Object.keys(missingModules).length === 0) return content;

  // Add import statements at the top
  for (const [module, pkg] of Object.entries(missingModules)) {
    // Check if import already exists
    if (!content.includes("from '" + pkg + "'") && !content.includes('from "' + pkg + '"')) {
      // Find a good place to add import (after last import)
      const lastImport = content.lastIndexOf("import {");
      if (lastImport === -1) continue;

      // Find end of that import statement
      let endIdx = content.indexOf(';', lastImport) + 1;
      const importLine = "\nimport { " + module + " } from '" + pkg + "';";
      content = content.substring(0, endIdx) + importLine + content.substring(endIdx);
    } else {
      // Module is from a pkg already imported, check if specific module is in the import
      const importRegex = new RegExp("import\\s*\\{([^}]+)\\}\\s*from\\s*['\"]" + pkg.replace('/', '\\/') + "['\"]");
      const match = content.match(importRegex);
      if (match && !match[1].includes(module)) {
        content = content.replace(match[0], match[0].replace('{', '{ ' + module + ','));
      }
    }
  }

  // Add modules to the component's imports array
  const importsMatch = content.match(/imports:\s*\[([^\]]+)\]/);
  if (importsMatch) {
    const currentList = importsMatch[1];
    const newModules = Object.keys(missingModules).filter(m => !currentList.includes(m));
    if (newModules.length > 0) {
      const newList = currentList.trimEnd() + ',\n    ' + newModules.join(',\n    ');
      content = content.replace(importsMatch[0], 'imports: [' + newList + ']');
    }
  }

  return content;
}

for (const relPath of files) {
  const fullPath = path.resolve(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log('SKIP: ' + fullPath);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;

  // Get current imports from component decorator
  const importsMatch = content.match(/imports:\s*\[([^\]]+)\]/);
  const currentImports = importsMatch ? importsMatch[1] : '';

  // Get HTML template file
  const htmlFile = getHtmlFile(fullPath);

  if (!htmlFile) {
    console.log('No template found for: ' + relPath);
    continue;
  }

  const missing = checkHtmlForMissingModules(htmlFile, currentImports);

  if (Object.keys(missing).length > 0) {
    console.log('Processing: ' + relPath);
    console.log('  Missing modules: ' + Object.keys(missing).join(', '));
    content = addModulesToImports(content, missing);
  }

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('  -> Fixed');
  }
}

console.log('\nDone!');
