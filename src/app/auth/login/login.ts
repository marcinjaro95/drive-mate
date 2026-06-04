import { Component, signal, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  readonly errorMessage = signal<string | null>(null);
  readonly isSubmitting = signal(false);

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.errorMessage.set(null);
    this.isSubmitting.set(true);
    const { email, password } = this.form.getRawValue();
    const error = await this.auth.signIn(email, password);
    this.isSubmitting.set(false);
    if (error) {
      this.errorMessage.set(error.message);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }
}
