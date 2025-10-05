import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth/auth.service';
import { RegisterRequest } from '../../core/models/auth/register-request.model';
import { UserRole } from '../../core/enums/user-role.enum';

@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ]
})
export class RegisterComponent implements OnInit {
  registerForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';
  showPassword = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.registerForm = this.createForm();
  }

  ngOnInit() {
    // Redirigir si ya está autenticado
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/home']);
    }

    // Configurar validaciones dinámicas según el rol seleccionado
    this.registerForm.get('role')?.valueChanges.subscribe(role => {
      this.updateValidatorsBasedOnRole(role);
    });
  }

  /**
   * Crea el formulario con validaciones básicas
   */
  private createForm(): FormGroup {
    return this.formBuilder.group({
      role: [UserRole.PASSENGER, Validators.required],
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{9,10}$/)]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      
      // Campos para conductores (inicialmente sin validación)
      licenseNumber: [''],
      vehiclePlate: [''],
      vehicleModel: [''],
      vehicleYear: ['']
    });
  }

  /**
   * Actualiza las validaciones de los campos de conductor según el rol seleccionado
   */
  private updateValidatorsBasedOnRole(role: UserRole) {
    const licenseControl = this.registerForm.get('licenseNumber');
    const plateControl = this.registerForm.get('vehiclePlate');
    const modelControl = this.registerForm.get('vehicleModel');
    const yearControl = this.registerForm.get('vehicleYear');

    if (role === UserRole.DRIVER) {
      // Activar validaciones para conductores
      licenseControl?.setValidators([Validators.required, Validators.minLength(5)]);
      plateControl?.setValidators([Validators.required, Validators.pattern(/^[A-Z]{3}-[0-9]{3}$/)]);
      modelControl?.setValidators([Validators.required, Validators.minLength(3)]);
      yearControl?.setValidators([
        Validators.required, 
        Validators.min(1990), 
        Validators.max(new Date().getFullYear() + 1)
      ]);
    } else {
      // Limpiar validaciones y valores para pasajeros
      licenseControl?.clearValidators();
      plateControl?.clearValidators();
      modelControl?.clearValidators();
      yearControl?.clearValidators();
      
      licenseControl?.setValue('');
      plateControl?.setValue('');
      modelControl?.setValue('');
      yearControl?.setValue('');
    }

    // Actualizar estado de validación
    licenseControl?.updateValueAndValidity();
    plateControl?.updateValueAndValidity();
    modelControl?.updateValueAndValidity();
    yearControl?.updateValueAndValidity();
  }

  /**
   * Procesa el envío del formulario de registro
   */
  onSubmit() {
    if (this.registerForm.valid) {
      this.isLoading = true;
      this.errorMessage = '';
      this.successMessage = '';

      const formValue = this.registerForm.value;
      
      const registerRequest: RegisterRequest = {
        email: formValue.email,
        password: formValue.password,
        firstName: formValue.firstName,
        lastName: formValue.lastName,
        phone: formValue.phone,
        role: formValue.role as UserRole
      };

      // Agregar campos específicos de conductor si aplica
      if (formValue.role === UserRole.DRIVER) {
        registerRequest.licenseNumber = formValue.licenseNumber;
        registerRequest.vehiclePlate = formValue.vehiclePlate;
        registerRequest.vehicleModel = formValue.vehicleModel;
        registerRequest.vehicleYear = formValue.vehicleYear;
      }

      console.log('Registrando usuario:', registerRequest.email);

      this.authService.register(registerRequest).subscribe({
        next: (response) => {
          console.log('Registro exitoso para:', registerRequest.email);
          this.isLoading = false;
          
          const tipoUsuario = formValue.role === UserRole.DRIVER ? 'conductor' : 'pasajero';
          this.successMessage = `¡${formValue.firstName} registrado exitosamente como ${tipoUsuario}! Puedes registrar otro usuario o ir al login.`;
          
          this.clearFormButKeepRole();
          
          // Auto-limpiar mensaje después de 5 segundos
          setTimeout(() => {
            this.successMessage = '';
          }, 5000);
        },
        error: (error) => {
          console.error('Error en registro:', error);
          this.isLoading = false;
          
          // Manejo específico de errores
          if (error.status === 400) {
            this.errorMessage = 'Datos inválidos. Verifica todos los campos.';
          } else if (error.status === 409) {
            this.errorMessage = 'Este email ya está registrado. Usa otro email.';
          } else if (error.status === 0) {
            this.errorMessage = 'No se pudo conectar al servidor. Verifica tu conexión.';
          } else {
            this.errorMessage = 'Error inesperado. Inténtalo de nuevo.';
          }
          
          // Auto-limpiar mensaje después de 5 segundos
          setTimeout(() => {
            this.errorMessage = '';
          }, 5000);
        }
      });
    } else {
      this.markFormGroupTouched();
    }
  }

  /**
   * Limpia el formulario manteniendo el tipo de usuario seleccionado
   */
  private clearFormButKeepRole() {
    const currentRole = this.registerForm.get('role')?.value;
    
    // Limpiar todos los campos excepto el rol
    this.registerForm.patchValue({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      licenseNumber: '',
      vehiclePlate: '',
      vehicleModel: '',
      vehicleYear: ''
    });
    
    this.registerForm.patchValue({
      role: currentRole
    });
    
    // Resetear estado de validación excepto para el rol
    Object.keys(this.registerForm.controls).forEach(key => {
      const control = this.registerForm.get(key);
      if (key !== 'role') {
        control?.markAsUntouched();
        control?.markAsPristine();
      }
    });
    
    this.showPassword = false;
  }

  // Getters para el template
  get role() { return this.registerForm.get('role'); }
  get firstName() { return this.registerForm.get('firstName'); }
  get lastName() { return this.registerForm.get('lastName'); }
  get email() { return this.registerForm.get('email'); }
  get phone() { return this.registerForm.get('phone'); }
  get password() { return this.registerForm.get('password'); }
  get licenseNumber() { return this.registerForm.get('licenseNumber'); }
  get vehiclePlate() { return this.registerForm.get('vehiclePlate'); }
  get vehicleModel() { return this.registerForm.get('vehicleModel'); }
  get vehicleYear() { return this.registerForm.get('vehicleYear'); }

  /**
   * Computed property para determinar si el usuario seleccionado es conductor
   */
  get isDriver(): boolean {
    return this.registerForm.get('role')?.value === UserRole.DRIVER;
  }

  /**
   * Alterna la visibilidad de la contraseña
   */
  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  /**
   * Navega a la página de login
   */
  goToLogin() {
    this.router.navigateByUrl('/login');
  }

  /**
   * Marca todos los campos como tocados para mostrar errores de validación
   */
  private markFormGroupTouched() {
    Object.keys(this.registerForm.controls).forEach(key => {
      const control = this.registerForm.get(key);
      control?.markAsTouched();
    });
  }
}
