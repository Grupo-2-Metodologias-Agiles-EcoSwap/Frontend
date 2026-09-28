import { Component, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { HttpClient } from '@angular/common/http';
import { SupabaseService } from '../../services/supabase.service';
import { from } from 'rxjs';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './register.html',
})
export class Register {
  registerForm: FormGroup;
  error: string = '';
  avatarBase64: string = '';
  isCompressing: boolean = false;
  isMicrosoftLoading: boolean = false;
  isLoading: boolean = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private http: HttpClient,
    private supabaseService: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {
    this.registerForm = this.fb.group({
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value
      ? null : { 'mismatch': true };
  }

  async onFileSelected(event: any) {
    if (event.target.files && event.target.files[0]) {
      console.log('File selected:', event.target.files[0].name);
      this.isCompressing = true;
      this.cdr?.detectChanges();

      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        const file = event.target.files[0];
        console.log('Starting compression...');
        this.avatarBase64 = await this.compressImage(file);
        console.log('Compression successful, length:', this.avatarBase64.length);
      } catch (err) {
        console.error('Error compressing image:', err);
      } finally {
        this.isCompressing = false;
        event.target.value = ''; // Reset file input here as well
        this.cdr?.detectChanges();
        console.log('Spinner should be hidden now');
      }
    }
  }

  removePhoto(event: Event, fileInput: HTMLInputElement) {
    event.stopPropagation();
    this.avatarBase64 = '';
    fileInput.value = '';
  }

  compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
      reader.onload = (event: any) => {
        const img = new Image();
        img.onerror = (e) => reject(e);
        img.src = event.target.result;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 400;
            const MAX_HEIGHT = 400;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);

            // Use WebP for better compression, quality 0.7
            const dataUrl = canvas.toDataURL('image/webp', 0.7);
            resolve(dataUrl);
          } catch (e) {
            reject(e);
          }
        };
      };
    });
  }

  onSubmit() {
    if (this.registerForm.valid && !this.isCompressing) {
      const email = this.registerForm.value.email;
      const password = this.registerForm.value.password;
      const name = this.registerForm.value.name;

      if (!email.endsWith('@upc.edu.pe')) {
        this.error = 'Solo se permiten correos de la comunidad UPC (@upc.edu.pe)';
        return;
      }

      this.isLoading = true;
      this.error = '';

      if (this.avatarBase64) {
        localStorage.setItem('pendingAvatar', this.avatarBase64);
      } else {
        localStorage.removeItem('pendingAvatar');
      }

      from(this.supabaseService.client.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            career: 'General',
            cycle: 1
          }
        }
      })).subscribe({
        next: (res) => {
          this.isLoading = false;
          if (res.error) {
            this.error = 'Error al crear la cuenta: ' + res.error.message;
          } else {
            alert('¡Cuenta creada con éxito!');
            this.router.navigate(['/login']);
          }
        },
        error: (err) => {
          this.isLoading = false;
          this.error = 'Error de conexión con el servidor de autenticación.';
        }
      });
    }
  }

  registerWithMicrosoft() {
    this.isMicrosoftLoading = true;
    this.error = '';

    from(this.supabaseService.client.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: window.location.origin + '/login'
      }
    })).subscribe({
      next: (res) => {
        if (res.error) {
          this.error = res.error.message;
          this.isMicrosoftLoading = false;
        }
      },
      error: (err) => {
        this.error = 'Error de conexión con Microsoft.';
        this.isMicrosoftLoading = false;
      }
    });
  }
}
