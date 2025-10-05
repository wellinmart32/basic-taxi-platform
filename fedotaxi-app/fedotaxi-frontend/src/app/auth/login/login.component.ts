import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth/auth.service';
import { LoginRequest } from 'src/app/core/models/auth/login-request.model';
import { AuthResponse } from 'src/app/core/models/auth/auth-response.model';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
  ]
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    // Redirigir si ya está autenticado
    if (this.authService.isAuthenticated()) {
      console.log('✅ [LOGIN] Usuario ya autenticado, redirigiendo');
      this.router.navigate(['/home']);
    }
  }

  /**
   * Procesa el envío del formulario de login
   */
  onSubmit() {
    if (this.loginForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';
      
      const { email, password } = this.loginForm.value;
      
      console.log('🚀 [LOGIN] Iniciando login para:', email);
      
      const loginRequest: LoginRequest = {
        email: email,
        password: password
      };
      
      this.authService.login(loginRequest).subscribe({
        next: (response: AuthResponse) => {
          console.log('✅ [LOGIN] Login exitoso');
          this.isLoading = false;
          
          this.router.navigate(['/home']).then((navigationSuccess) => {
            if (!navigationSuccess) {
              console.error('❌ [LOGIN] Error en navegación');
            }
          }).catch((navigationError) => {
            console.error('💥 [LOGIN] Error en navegación:', navigationError);
          });
        },
        error: (error) => {
          console.error('❌ [LOGIN] Error en login:', error);
          this.isLoading = false;
          
          // Manejo de errores específicos
          if (error.status === 401) {
            this.errorMessage = 'Credenciales incorrectas. Verifica tu email y contraseña.';
          } else if (error.status === 0) {
            this.errorMessage = 'No se pudo conectar al servidor. Verifica tu conexión.';
          } else {
            this.errorMessage = 'Error inesperado. Inténtalo de nuevo.';
          }
        }
      });
    } else {
      this.markFormGroupTouched();
    }
  }

  // Getters para el template
  get email() {
    return this.loginForm.get('email');
  }

  get password() {
    return this.loginForm.get('password');
  }

  /**
   * Marca todos los campos como tocados para mostrar errores de validación
   */
  private markFormGroupTouched() {
    Object.keys(this.loginForm.controls).forEach(key => {
      const control = this.loginForm.get(key);
      control?.markAsTouched();
    });
  }

  /**
   * Alterna la visibilidad de la contraseña
   */
  togglePasswordVisibility() {
    const passwordInput = document.querySelector('#password') as HTMLInputElement;
    const eyeIcon = document.querySelector('.btn-outline-secondary i') as HTMLElement;
    
    if (passwordInput && eyeIcon) {
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        eyeIcon.className = 'fas fa-eye-slash';
      } else {
        passwordInput.type = 'password';
        eyeIcon.className = 'fas fa-eye';
      }
    }
  }

  /**
   * Navega a la página de registro
   */
  goToRegister() {
    console.log('🔄 [LOGIN] Navegando a register');
    this.router.navigateByUrl('/register');
  }
}
