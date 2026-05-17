import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OnboardingNextStepCtaComponent } from './onboarding-next-step-cta.component';

describe('OnboardingNextStepCtaComponent', () => {
  let fixture: ComponentFixture<OnboardingNextStepCtaComponent>;
  let component: OnboardingNextStepCtaComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnboardingNextStepCtaComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingNextStepCtaComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing when nextAction is null', () => {
    fixture.componentRef.setInput('nextAction', null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.next-step-cta')).toBeNull();
  });

  it('renders nothing when nextAction is "none"', () => {
    fixture.componentRef.setInput('nextAction', 'none');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.next-step-cta')).toBeNull();
  });

  it('renders title, subtitle and cta for complete_certification', () => {
    fixture.componentRef.setInput('nextAction', 'complete_certification');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.next-step-cta__title')?.textContent).toContain('qualification Tuita');
    const cta = root.querySelector('a[mat-flat-button]') as HTMLAnchorElement;
    expect(cta).not.toBeNull();
    expect(cta.getAttribute('href')).toBe('/certification');
  });

});
