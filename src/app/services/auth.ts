import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { User } from '../models';
import { HttpClient } from '@angular/common/http';
import { tap, switchMap, map } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private supabaseService: SupabaseService
  ) {
    // Simple mock persistence
    const saved = localStorage.getItem('currentUser');
    if (saved && saved !== 'undefined') {
      try {
        const parsed = JSON.parse(saved);
        this.currentUserSubject.next(parsed);
        // Recargar favoritos en segundo plano
        this.http.get<any[]>(`${this.apiUrl}/favorites`).subscribe({
          next: (favs) => {
            parsed.favorites = (favs || []).map(f => String(f.id));
            localStorage.setItem('currentUser', JSON.stringify(parsed));
            this.currentUserSubject.next(parsed);
          }
        });
      } catch (e) {
        console.error('Error parsing currentUser from localStorage:', e);
        localStorage.removeItem('currentUser');
      }
    }

    // Listen to Supabase auth events
    this.supabaseService.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const user = session.user;
        const metadata = user.user_metadata || {};
        
        const current = this.currentUser;
        if (!current || String(current.id) !== String(user.id)) {
          const pendingAvatar = localStorage.getItem('pendingAvatar');
          this.http.post<User>(`${this.apiUrl}/users/sync`, {
            name: metadata['name'] || user.email?.split('@')[0] || 'Estudiante UPC',
            career: metadata['career'] || 'General',
            cycle: metadata['cycle'] || 1,
            avatar: pendingAvatar || metadata['avatar'] || ''
          }).subscribe({
            next: (syncedUser) => {
              if (pendingAvatar) {
                localStorage.removeItem('pendingAvatar');
              }
              // Recargar favoritos del usuario al sincronizar perfil
              this.http.get<any[]>(`${this.apiUrl}/favorites`).subscribe({
                next: (favs) => {
                  syncedUser.favorites = (favs || []).map(f => String(f.id));
                  localStorage.setItem('currentUser', JSON.stringify(syncedUser));
                  this.currentUserSubject.next(syncedUser);
                },
                error: () => {
                  syncedUser.favorites = [];
                  localStorage.setItem('currentUser', JSON.stringify(syncedUser));
                  this.currentUserSubject.next(syncedUser);
                }
              });
            },
            error: (err) => console.error('Failed to sync user profile on auth state change:', err)
          });
        }
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('currentUser');
        this.currentUserSubject.next(null);
      }
    });
  }

  login(email: string, password?: string): Observable<User> {
    return from(this.supabaseService.signIn(email, password || '')).pipe(
      switchMap((response: any): Observable<User> => {
        if (response.error) {
          throw response.error;
        }
        const user = response.data.user;
        if (!user) {
          throw new Error('No user data returned from Supabase');
        }
        
        const metadata = user.user_metadata || {};
        const pendingAvatar = localStorage.getItem('pendingAvatar');
        return this.http.post<User>(`${this.apiUrl}/users/sync`, {
          name: metadata['name'] || user.email?.split('@')[0] || 'Estudiante UPC',
          career: metadata['career'] || 'General',
          cycle: metadata['cycle'] || 1,
          avatar: pendingAvatar || metadata['avatar'] || ''
        }).pipe(
          tap(() => {
            if (pendingAvatar) {
              localStorage.removeItem('pendingAvatar');
            }
          })
        );
      }),
      switchMap((syncedUser: User): Observable<User> => {
        // Cargar los favoritos desde la base de datos
        return this.http.get<any[]>(`${this.apiUrl}/favorites`).pipe(
          map((favs: any[]): User => {
            syncedUser.favorites = (favs || []).map(f => String(f.id));
            return syncedUser;
          })
        );
      }),
      tap((user: User) => {
        localStorage.setItem('currentUser', JSON.stringify(user));
        this.currentUserSubject.next(user);
      })
    );
  }

  logout() {
    this.supabaseService.signOut();
    localStorage.removeItem('currentUser');
    this.currentUserSubject.next(null);
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  updateCurrentUser(user: User) {
    localStorage.setItem('currentUser', JSON.stringify(user));
    this.currentUserSubject.next(user);
  }
}
