import { Component } from '@angular/core';
import { ContractorLayoutComponent } from './components/layout/contractor-layout.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ContractorLayoutComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
