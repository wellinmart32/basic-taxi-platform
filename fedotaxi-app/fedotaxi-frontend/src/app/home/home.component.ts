import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../core/services/auth/auth.service';
import { TripService } from '../core/services/trip/trip.service';
import { User } from '../core/models/auth/user.model';
import { Trip } from '../core/models/trip/Trip.model';
import { TripStatus } from '../core/enums/trip-status.enum';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  
  // Estado del usuario
  userRole: string | null = null;
  userName: string = '';
  isDriver: boolean = false;
  isPassenger: boolean = false;
  
  // Estado del viaje actual (solo información, sin controles)
  currentTrip: Trip | null = null;
  tripStatus: string = '';
  
  // Suscripciones reactivas
  private currentUserSubscription?: Subscription;
  
  constructor(
    private authService: AuthService,
    private tripService: TripService,
    private router: Router
  ) {
    console.log('🏠 [HOME] Inicializando componente');
  }

  ngOnInit() {
    this.subscribeToAuthChanges();
    this.checkAuthenticationStatus();
  }

  ngOnDestroy() {
    console.log('🗑️ [HOME] Limpiando suscripciones');
    this.currentUserSubscription?.unsubscribe();
  }

  /**
   * Configura la suscripción reactiva para detectar cambios en el estado de autenticación
   */
  private subscribeToAuthChanges() {
    this.currentUserSubscription = this.authService.currentUser$.subscribe({
      next: (user: User | null) => {
        console.log('🔔 [HOME] Usuario cambió:', user?.email || 'Sin usuario');
        
        if (user) {
          this.updateUserData(user);
        } else {
          this.clearUserData();
        }
      },
      error: (error) => {
        console.error('❌ [HOME] Error en suscripción auth:', error);
      }
    });
  }

  /**
   * Actualiza los datos básicos del usuario en el componente
   */
  private updateUserData(user: User) {
    this.userRole = user.role;
    this.isDriver = user.role === 'DRIVER';
    this.isPassenger = user.role === 'PASSENGER';
    this.userName = this.getUserDisplayName();
    
    console.log('✅ [HOME] Datos actualizados:', {
      role: this.userRole,
      isDriver: this.isDriver
    });
    
    this.loadCurrentTripInfo();
  }

  /**
   * Limpia los datos del usuario al cerrar sesión
   */
  private clearUserData() {
    this.userRole = null;
    this.userName = '';
    this.isDriver = false;
    this.isPassenger = false;
    this.currentTrip = null;
    this.tripStatus = '';
  }

  /**
   * Verifica si el usuario está autenticado, redirige a login si no
   */
  private checkAuthenticationStatus() {
    const isAuth = this.authService.isAuthenticated();
    
    if (!isAuth) {
      console.log('❌ [HOME] Usuario no autenticado, redirigiendo');
      this.router.navigate(['/login']);
      return;
    }
    
    // Cargar datos del usuario si no están disponibles
    if (!this.userRole) {
      const currentUser = this.authService.getCurrentUser();
      if (currentUser) {
        this.updateUserData(currentUser);
      }
    }
  }

  /**
   * Obtiene información básica del viaje activo para mostrar en la UI
   */
  private loadCurrentTripInfo() {
    this.tripService.getMyTrips().subscribe({
      next: (trips) => {
        const activeTrip = trips.find(trip => 
          [TripStatus.REQUESTED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS].includes(trip.status)
        );
        
        if (activeTrip) {
          this.currentTrip = activeTrip;
          this.tripStatus = activeTrip.status;
          console.log('📋 [HOME] Viaje activo encontrado:', activeTrip.id);
        } else {
          this.currentTrip = null;
          this.tripStatus = '';
        }
      },
      error: (error) => {
        console.warn('⚠️ [HOME] Error obteniendo viajes:', error);
        this.currentTrip = null;
        this.tripStatus = '';
      }
    });
  }

  // ===== MÉTODOS DE NAVEGACIÓN =====

  /**
   * Navega al dashboard del conductor
   */
  goToDriverDashboard() {
    console.log('🚗 [HOME] Navegando a dashboard');
    this.router.navigate(['/driver-dashboard']);
  }

  /**
   * Navega a la pantalla de solicitud de viaje
   */
  requestTrip() {
    console.log('🚖 [HOME] Navegando a solicitar viaje');
    this.router.navigate(['/request-trip']);
  }

  /**
   * Navega al historial de viajes
   */
  viewTripHistory() {
    this.router.navigate(['/ride-history']);
  }

  /**
   * Navega a los detalles del viaje actual
   */
  viewCurrentTripDetails() {
    if (this.currentTrip) {
      console.log('👁️ [HOME] Ver detalles del viaje:', this.currentTrip.id);
      this.router.navigate(['/trip-status', this.currentTrip.id]);
    }
  }

  /**
   * Navega al perfil del usuario
   */
  goToProfile() {
    alert('Perfil será implementado próximamente');
  }

  /**
   * Navega a configuración
   */
  goToSettings() {
    alert('Configuración será implementada próximamente');
  }

  /**
   * Cierra la sesión del usuario
   */
  logout() {
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
      console.log('🚪 [HOME] Cerrando sesión');
      this.authService.logout();
      this.router.navigate(['/login']);
    }
  }

  // ===== MÉTODOS AUXILIARES PARA EL TEMPLATE =====

  /**
   * Obtiene el nombre a mostrar según el rol del usuario
   */
  private getUserDisplayName(): string {
    if (this.isDriver) return 'Conductor';
    if (this.isPassenger) return 'Pasajero';
    return 'Usuario';
  }

  /**
   * Obtiene la clase CSS del color según el estado del viaje
   */
  getTripStatusColor(): string {
    switch (this.tripStatus) {
      case 'REQUESTED': return 'warning';
      case 'ACCEPTED': return 'primary';
      case 'IN_PROGRESS': return 'success';
      case 'COMPLETED': return 'success';
      case 'CANCELLED': return 'danger';
      default: return 'secondary';
    }
  }

  /**
   * Obtiene el texto descriptivo del estado del viaje
   */
  getTripStatusText(): string {
    switch (this.tripStatus) {
      case 'REQUESTED': return 'Solicitado';
      case 'ACCEPTED': return 'Aceptado';
      case 'IN_PROGRESS': return 'En progreso';
      case 'COMPLETED': return 'Completado';
      case 'CANCELLED': return 'Cancelado';
      default: return 'Sin estado';
    }
  }

  /**
   * Verifica si existe un viaje activo
   */
  hasActiveTrip(): boolean {
    return this.currentTrip !== null;
  }

  /**
   * Obtiene descripción contextual del viaje según el rol y estado
   */
  getTripDescription(): string {
    if (!this.currentTrip) return '';
    
    switch (this.tripStatus) {
      case 'REQUESTED':
        return this.isPassenger 
          ? 'Buscando conductor disponible...' 
          : 'Nuevo viaje asignado';
      case 'ACCEPTED':
        return this.isPassenger 
          ? 'Conductor en camino al punto de recogida' 
          : 'Dirígete al punto de recogida';
      case 'IN_PROGRESS':
        return this.isPassenger 
          ? 'Viaje en progreso hacia el destino' 
          : 'Llevando pasajero al destino';
      default:
        return 'Viaje activo';
    }
  }

  /**
   * Debug del estado de autenticación (solo desarrollo)
   */
  debugAuthState() {
    this.authService.debugAuthState();
  }

  /**
   * Getter con el estado completo del componente para debugging
   */
  get componentState() {
    return {
      userRole: this.userRole,
      userName: this.userName,
      isDriver: this.isDriver,
      isPassenger: this.isPassenger,
      hasActiveTrip: this.hasActiveTrip(),
      tripStatus: this.tripStatus,
      currentTripId: this.currentTrip?.id || null
    };
  }
}
