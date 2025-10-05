import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'request-trip',
    loadComponent: () => import('./passenger/request-trip/request-trip.component').then(m => m.RequestTripComponent)
  },
  {
    path: 'driver-dashboard',
    loadComponent: () => import('./driver/driver-dashboard/driver-dashboard.component').then(m => m.DriverDashboardComponent)
  },
  {
    path: 'trip-status/:id',
    loadComponent: () => import('./passenger/trip-status/trip-status.component').then(m => m.TripStatusComponent)
  },
  {
    path: 'ride-tracking/:id',
    loadComponent: () => import('./passenger/ride-tracking/ride-tracking.component').then(m => m.RideTrackingComponent)
  },
  {
    path: 'ride-history',
    loadComponent: () => import('./passenger/ride-history/ride-history.component').then(m => m.RideHistoryComponent)
  },
  {
    path: '**',
    redirectTo: '/login'
  }
];
