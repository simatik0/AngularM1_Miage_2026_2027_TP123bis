import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-snack-bar',
  templateUrl: './snack-bar.html',
  styleUrl: './snack-bar.css',
})
export class SnackBarComponent {
  readonly message = input.required<string>();
  readonly type = input<'success' | 'error'>('success');
  readonly closed = output<void>();
}
