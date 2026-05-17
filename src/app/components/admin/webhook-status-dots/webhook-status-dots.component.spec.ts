import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebhookStatusDotsComponent } from './webhook-status-dots.component';

describe('WebhookStatusDotsComponent', () => {
  it('renders 4 dots, only sent ones get the --sent class', () => {
    const fixture: ComponentFixture<WebhookStatusDotsComponent> =
      TestBed.createComponent(WebhookStatusDotsComponent);
    fixture.componentRef.setInput('webhooks',
      { rejected: false, ready_to_pay: true, payment_in_progress: false, paid: true });
    fixture.detectChanges();
    const sent = fixture.nativeElement.querySelectorAll('.dot--sent');
    expect(sent.length).toBe(2);
  });
});
