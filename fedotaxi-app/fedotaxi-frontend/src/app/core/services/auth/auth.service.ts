import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, throwError } from 'rxjs';
import { LoginRequest } from '../../models/auth/login-request.model';
import { RegisterRequest } from '../../models/auth/register-request.model';
import { AuthResponse } from '../../models/auth/auth-response.model';
import { User } from '../../models/auth/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly API_URL = 'http://localhost:8081/api/auth';
  
  // BehaviorSubject para reactividad del estado de autenticación
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    console.log('🔧 AuthService inicializado');
    this.checkStoredAuth();
  }

  /**
   * Iniciar sesión de usuario
   */
  login(loginRequest: LoginRequest): Observable<AuthResponse> {
    console.log(`🔑 Iniciando login: ${loginRequest.email}`);
    
    return this.http.post<AuthResponse>(`${this.API_URL}/login`, loginRequest)
      .pipe(
        tap(response => {
          console.log('✅ Login exitoso');
          
          // Verificar token en respuesta
          const token = response.jwt || (response as any).token;
          
          if (!token) {
            console.error('❌ Token no recibido del servidor');
            throw new Error('Token no recibido del servidor');
          }
          
          // Guardar datos de autenticación
          this.saveAuthData(token, response, loginRequest.email);
          
          // Crear y emitir usuario
          const user: User = {
            id: response.userId,
            role: response.role as any,
            email: loginRequest.email,
            firstName: '',
            lastName: '',
            phone: '',
            active: true
          };
          
          console.log(`🔄 Usuario actualizado: ${user.role}`);
          this.currentUserSubject.next(user);
        }),
        catchError(error => {
          console.error('❌ Error en login:', error);
          return throwError(() => error);
        })
      );
  }

  /**
   * Registrar nuevo usuario
   */
  register(registerRequest: RegisterRequest): Observable<AuthResponse> {
    console.log(`📝 Registrando usuario: ${registerRequest.email}`);
    
    return this.http.post<AuthResponse>(`${this.API_URL}/register`, registerRequest)
      .pipe(
        tap(response => {
          console.log('✅ Usuario registrado exitosamente');
        }),
        catchError(error => {
          console.error('❌ Error en registro:', error);
          return throwError(() => error);
        })
      );
  }

  /**
   * Cerrar sesión del usuario
   */
  logout(): void {
    console.log('🚪 Cerrando sesión');
    
    // Limpiar datos almacenados
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    
    // Emitir cambio de estado
    this.currentUserSubject.next(null);
    
    console.log('✅ Sesión cerrada completamente');
  }

  /**
   * Verificar si el usuario está autenticado
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    
    if (!token) {
      return false;
    }
    
    // Verificar si el token está expirado
    try {
      const payload = this.decodeToken(token);
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (payload.exp < currentTime) {
        console.warn('⚠️ Token expirado, limpiando datos');
        this.logout();
        return false;
      }
    } catch (error) {
      console.error('❌ Error decodificando token:', error);
      this.logout();
      return false;
    }
    
    return true;
  }

  /**
   * Obtener token JWT almacenado
   */
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  /**
   * Obtener rol del usuario actual
   */
  getUserRole(): string | null {
    return localStorage.getItem('userRole');
  }

  /**
   * Obtener usuario actual del estado
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Obtener ID del usuario actual
   */
  getCurrentUserId(): number | null {
    const userId = localStorage.getItem('userId');
    return userId ? parseInt(userId) : null;
  }

  /**
   * Verificar si el usuario actual es conductor
   */
  isDriver(): boolean {
    return this.getUserRole() === 'DRIVER';
  }

  /**
   * Verificar si el usuario actual es pasajero
   */
  isPassenger(): boolean {
    return this.getUserRole() === 'PASSENGER';
  }

  /**
   * Verificar si el usuario actual es administrador
   */
  isAdmin(): boolean {
    return this.getUserRole() === 'ADMIN';
  }

  /**
   * Verificar autenticación almacenada al inicializar el servicio
   */
  private checkStoredAuth(): void {
    console.log('🔍 Verificando autenticación almacenada');
    
    const token = this.getToken();
    const userRole = this.getUserRole();
    const userId = localStorage.getItem('userId');
    const userEmail = localStorage.getItem('userEmail');

    if (token && userRole && userId) {
      console.log(`✅ Restaurando usuario: ${userRole}`);
      
      const user: User = {
        id: parseInt(userId),
        role: userRole as any,
        email: userEmail || '',
        firstName: '',
        lastName: '',
        phone: '',
        active: true
      };
      
      this.currentUserSubject.next(user);
    } else {
      console.log('❌ No hay datos válidos en localStorage');
    }
  }

  /**
   * Guardar datos de autenticación en localStorage
   */
  private saveAuthData(token: string, response: AuthResponse, email: string): void {
    console.log('💾 Guardando datos de autenticación');
    
    // Limpiar datos anteriores
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    
    // Guardar datos nuevos
    localStorage.setItem('token', token);
    localStorage.setItem('userRole', response.role);
    localStorage.setItem('userId', response.userId.toString());
    localStorage.setItem('userEmail', email);
    
    console.log('✅ Datos guardados exitosamente');
  }

  /**
   * Decodificar token JWT para obtener payload
   */
  private decodeToken(token: string): any {
    try {
      const payload = token.split('.')[1];
      const decoded = atob(payload);
      return JSON.parse(decoded);
    } catch (error) {
      console.error('❌ Error decodificando token:', error);
      throw error;
    }
  }

  /**
   * Debug del estado completo de autenticación
   */
  debugAuthState(): void {
    console.log('\n🔍 === DEBUG AUTH STATE ===');
    
    const token = this.getToken();
    const role = this.getUserRole();
    const userId = localStorage.getItem('userId');
    const email = localStorage.getItem('userEmail');
    const currentUser = this.getCurrentUser();
    
    console.log('Estado de autenticación:');
    console.log(`  Token presente: ${!!token}`);
    console.log(`  Role: ${role}`);
    console.log(`  UserId: ${userId}`);
    console.log(`  Email: ${email}`);
    console.log(`  IsAuthenticated: ${this.isAuthenticated()}`);
    console.log(`  CurrentUser:`, currentUser);
    console.log(`  IsDriver: ${this.isDriver()}`);
    console.log(`  IsPassenger: ${this.isPassenger()}`);
    console.log(`  IsAdmin: ${this.isAdmin()}`);
    
    console.log('🔍 === END DEBUG ===\n');
  }
}
