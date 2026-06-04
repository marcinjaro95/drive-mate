import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [MatButtonModule],
  templateUrl: './dashboard.html',
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
