import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * SkeletonComponent — placeholder de chargement réutilisable.
 *
 * Remplace les spinners isolés et les écrans blancs par des formes « fantômes »
 * (gris clair avec un reflet qui balaie) qui reproduisent la structure réelle
 * du contenu. Le contenu paraît arriver plus vite et l'œil garde ses repères.
 *
 * Les styles d'apparence (formes fantômes, reflet) sont GLOBAUX (cf.
 * src/styles.scss, section « Skeletons »). Le composant n'embarque qu'une seule
 * règle `:host` de layout : `display: block; width: 100%` — sans elle l'hôte
 * reste `inline` et se réduit à la largeur de son contenu, ce qui fait
 * s'effondrer les largeurs en `%` des lignes fantômes (cartes vides/rabougries).
 *
 * @example
 * ```html
 * <!-- Pendant le 1er chargement d'une table -->
 * <app-skeleton *ngIf="loading()" variant="table" [rows]="8" [columns]="6" />
 *
 * <!-- Liste de cartes (modals, sections) -->
 * <app-skeleton *ngIf="loading()" variant="cards" [rows]="3" />
 *
 * <!-- Liste de lignes (icône + textes + badge) -->
 * <app-skeleton *ngIf="loading()" variant="list" [rows]="6" />
 *
 * <!-- Bloc de texte / paragraphes -->
 * <app-skeleton *ngIf="loading()" variant="text" [rows]="4" />
 * ```
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
    `,
  ],
  template: `
    @switch (variant) {
      @case ('table') {
        <div class="table-skeleton" aria-hidden="true">
          @for (r of rowsArray; track r) {
            <div class="table-skeleton__row" [style.--row-index]="r">
              @for (c of colsArray; track c) {
                <div
                  class="table-skeleton__cell"
                  [class.table-skeleton__cell--actions]="c === colsArray.length - 1"
                >
                  <span class="skeleton skeleton--text" [style.width.%]="cellWidth(c)"></span>
                </div>
              }
            </div>
          }
        </div>
      }
      @case ('cards') {
        <div class="cards-skeleton" aria-hidden="true">
          @for (r of rowsArray; track r) {
            <div class="skel-card" [style.--row-index]="r">
              <span class="skeleton skeleton--heading"></span>
              <span class="skeleton skeleton--text" style="width: 92%"></span>
              <span class="skeleton skeleton--text" style="width: 74%"></span>
              <span class="skeleton skeleton--text" style="width: 84%"></span>
            </div>
          }
        </div>
      }
      @case ('list') {
        <div class="list-skeleton" aria-hidden="true">
          @for (r of rowsArray; track r) {
            <div class="list-skeleton__row" [style.--row-index]="r">
              <span class="skeleton skeleton--avatar"></span>
              <div class="list-skeleton__lines">
                <span class="skeleton skeleton--text" style="width: 45%"></span>
                <span class="skeleton skeleton--text" style="width: 72%"></span>
              </div>
              <span class="skeleton skeleton--pill"></span>
            </div>
          }
        </div>
      }
      @case ('text') {
        <div class="text-skeleton" aria-hidden="true">
          @for (r of rowsArray; track r) {
            <span class="skeleton skeleton--text" [style.width.%]="textWidth(r, rowsArray.length)"></span>
          }
        </div>
      }
    }
    <span class="sr-only" role="status">{{ label }}</span>
  `,
})
export class SkeletonComponent {
  /** Forme du placeholder à afficher. */
  @Input() variant: 'table' | 'cards' | 'list' | 'text' = 'table';

  /** Nombre de lignes / cartes fantômes. */
  @Input() rows = 6;

  /** Nombre de colonnes (variant « table » uniquement). */
  @Input() columns = 5;

  /** Texte annoncé aux lecteurs d'écran pendant le chargement. */
  @Input() label = 'Chargement…';

  get rowsArray(): number[] {
    return Array.from({ length: Math.max(1, this.rows) }, (_, i) => i);
  }

  get colsArray(): number[] {
    return Array.from({ length: Math.max(1, this.columns) }, (_, i) => i);
  }

  /** Largeur (%) d'une cellule de table — variation pour un rendu naturel. */
  cellWidth(col: number): number {
    const palette = [62, 78, 54, 70, 48, 82, 66];
    return palette[col % palette.length];
  }

  /** Largeur (%) d'une ligne de texte — la dernière est volontairement courte. */
  textWidth(line: number, total: number): number {
    if (line === total - 1) return 45;
    const palette = [96, 88, 92, 80, 94, 86];
    return palette[line % palette.length];
  }
}
