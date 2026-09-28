import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.currentUser) {
    return true;
  }

  // Si no está autenticado, redirige al login
  router.navigate(['/login']);
  return false;
};
