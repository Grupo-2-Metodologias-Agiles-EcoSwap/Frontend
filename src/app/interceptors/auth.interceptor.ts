import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SupabaseService } from '../services/supabase.service';
import { from, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const supabaseService = inject(SupabaseService);

  if (req.url.startsWith(environment.apiUrl)) {
    return from(supabaseService.getSessionToken()).pipe(
      switchMap(token => {
        if (token) {
          const clonedReq = req.clone({
            headers: req.headers.set('Authorization', `Bearer ${token}`)
          });
          return next(clonedReq);
        }
        return next(req);
      })
    );
  }

  return next(req);
};
