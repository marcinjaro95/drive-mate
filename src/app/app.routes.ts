import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () => import('./auth/signup/signup').then((m) => m.SignupComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard').then((m) => m.DashboardComponent),
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./vehicles/vehicle-list/vehicle-list').then((m) => m.VehicleListComponent),
            pathMatch: 'full',
          },
          {
            path: 'vehicles/new',
            loadComponent: () =>
              import('./vehicles/vehicle-add/vehicle-add').then((m) => m.VehicleAddComponent),
          },
          {
            path: 'vehicles/:id/edit',
            loadComponent: () =>
              import('./vehicles/vehicle-edit/vehicle-edit').then((m) => m.VehicleEditComponent),
          },
          {
            path: 'vehicles/:id',
            loadComponent: () =>
              import('./vehicles/schedule-view/schedule-view').then((m) => m.ScheduleViewComponent),
          },
        ],
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
];
