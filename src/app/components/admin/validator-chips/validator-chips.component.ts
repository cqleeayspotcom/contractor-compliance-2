import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ValidationState = 'approved' | 'rejected' | null;
export interface ValidatorChipsInput {
  compliance: ValidationState;
  production: ValidationState;
  accounting: ValidationState;
}

@Component({
  selector: 'app-validator-chips',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './validator-chips.component.html',
  styleUrl: './validator-chips.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValidatorChipsComponent {
  @Input({ required: true }) validations!: ValidatorChipsInput;

  state(type: keyof ValidatorChipsInput): ValidationState { return this.validations[type]; }
  cssClass(type: keyof ValidatorChipsInput): string {
    const s = this.state(type) ?? 'pending';
    return `vchip vchip--${s}`;
  }
}
