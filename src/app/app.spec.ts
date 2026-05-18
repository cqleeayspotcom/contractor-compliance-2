import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ContractorLayoutComponent } from './components/layout/contractor-layout.component';
import { Component } from '@angular/core';

// Stub the layout component to avoid pulling in its full dependency tree
@Component({ selector: 'app-contractor-layout', standalone: true, template: '' })
class ContractorLayoutStub {}

describe('App', () => {
  beforeEach(async () => {
    // Reset explicite : sinon le 2e `it` voit un TestBed déjà instancié par le
    // 1er (Angular ne reset pas auto entre tests dans la même file ici).
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [App, ContractorLayoutStub],
    })
      .overrideComponent(App, {
        remove: { imports: [ContractorLayoutComponent] },
        add: { imports: [ContractorLayoutStub] },
      })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the contractor layout', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-contractor-layout')).toBeTruthy();
  });
});
