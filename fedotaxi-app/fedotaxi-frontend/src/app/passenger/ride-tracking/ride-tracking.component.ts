import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { TripService } from '../../core/services/trip/trip.service';
import { GeolocationService, LocationCoordinates } from '../../core/services/geolocation/geolocation.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { Trip } from '../../core/models/trip/Trip.model';
import { TripStatus } from '../../core/enums/trip-status.enum';

@Component({
  selector: 'app-ride-tracking',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ride-tracking.component.html',
  styleUrls: ['./ride-tracking.component.scss']
})
export class RideTrackingComponent implements OnInit, OnDestroy {
  
  // Datos del viaje
  trip: Trip | null = null;
  tripId: number | null = null;
  isLoading = true;
  errorMessage = '';
  
  // Ubicaciones
  userLocation: LocationCoordinates | null = null;
  driverLocation: LocationCoordinates | null = null;
  
  // Estados de seguimiento
  isTrackingUser = false;
  isLoadingLocation = false;
  estimatedArrival = '';
  distanceToDestination = 0;
  
  // Subscripciones para polling y tracking
  private tripPollingSubscription?: Subscription;
  private locationTrackingSubscription?: Subscription;
  
  // Intervalos de actualización
  private readonly TRIP_POLLING_INTERVAL = 10000; // 10 segundos
  public readonly LOCATION_TRACKING_INTERVAL = 15000; // 15 segundos
  
  // Tipo de usuario
  isPassenger = false;
  isDriver = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tripService: TripService,
    private geolocationService: GeolocationService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    console.log('🗺️ Iniciando componente de seguimiento');
    
    this.isPassenger = this.authService.isPassenger();
    this.isDriver = this.authService.isDriver();
    
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.tripId = parseInt(id);
        console.log(`🆔 Trip ID: ${this.tripId}`);
        this.loadTripAndStartTracking();
      } else {
        this.errorMessage = 'ID del viaje no válido';
        this.router.navigate(['/home']);
      }
    });
  }

  ngOnDestroy() {
    console.log('🗑️ Limpiando componente de seguimiento');
    this.stopAllTracking();
  }

  /**
   * Cargar datos del viaje y validar permisos
   */
  private loadTripAndStartTracking() {
    if (!this.tripId) return;
    
    this.tripService.getTripById(this.tripId).subscribe({
      next: (trip) => {
        this.trip = trip;
        this.isLoading = false;
        
        console.log(`✅ Viaje cargado: ${trip.id} - Estado: ${trip.status}`);
        
        if (!this.canTrackThisTrip(trip)) {
          this.errorMessage = 'No tienes permiso para hacer seguimiento de este viaje';
          setTimeout(() => this.router.navigate(['/home']), 3000);
          return;
        }
        
        if (trip.status !== TripStatus.IN_PROGRESS) {
          this.errorMessage = 'Solo se puede hacer seguimiento de viajes en progreso';
          setTimeout(() => this.router.navigate(['/trip-status', trip.id]), 3000);
          return;
        }
        
        this.startTracking();
      },
      error: (error) => {
        this.isLoading = false;
        console.error(`❌ Error cargando viaje: ${error.status}`);
        
        if (error.status === 404) {
          this.errorMessage = 'Viaje no encontrado';
        } else if (error.status === 403) {
          this.errorMessage = 'No tienes permiso para ver este viaje';
        } else {
          this.errorMessage = 'Error al cargar el viaje';
        }
        
        setTimeout(() => this.router.navigate(['/home']), 3000);
      }
    });
  }

  /**
   * Verificar permisos del usuario para este viaje
   */
  private canTrackThisTrip(trip: Trip): boolean {
    const currentUserId = this.authService.getCurrentUserId();
    if (!currentUserId) return false;
    
    return (this.isPassenger && trip.passengerId === currentUserId) ||
           (this.isDriver && trip.driverId === currentUserId);
  }

  /**
   * Manejar cambios de estado del viaje
   */
  private handleStatusChange(newStatus: TripStatus) {
    console.log(`🔄 Cambio de estado: ${newStatus}`);
    
    switch (newStatus) {
      case TripStatus.COMPLETED:
        this.displayStatusMessage('¡Viaje completado exitosamente!', 'success');
        this.stopAllTracking();
        setTimeout(() => this.router.navigate(['/trip-status', this.tripId]), 3000);
        break;
        
      case TripStatus.CANCELLED:
        this.displayStatusMessage('El viaje ha sido cancelado', 'danger');
        this.stopAllTracking();
        setTimeout(() => this.router.navigate(['/home']), 2000);
        break;
        
      case TripStatus.ACCEPTED:
        this.displayStatusMessage('El viaje está en preparación', 'info');
        setTimeout(() => this.router.navigate(['/trip-status', this.tripId]), 2000);
        break;
    }
  }

  /**
   * Mostrar mensajes de estado al usuario
   */
  private displayStatusMessage(message: string, type: 'success' | 'danger' | 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    if (type !== 'success') {
      alert(message);
    }
  }

  /**
   * Detener seguimiento manualmente
   */
  stopTracking() {
    console.log('⏹️ Deteniendo tracking por usuario');
    this.stopAllTracking();
    
    if (this.tripId) {
      this.router.navigate(['/trip-status', this.tripId]);
    } else {
      this.router.navigate(['/home']);
    }
  }

  /**
   * Calcular tiempo estimado de llegada basado en distancia y contexto
   */
  private calculateEstimatedArrival(): string {
    if (!this.userLocation || !this.trip) return '';
    
    const destination: LocationCoordinates = {
      latitude: this.trip.destinationLatitude,
      longitude: this.trip.destinationLongitude
    };
    
    const distance = this.geolocationService.calculateDistance(
      this.userLocation,
      destination
    );
    
    // Velocidad promedio ajustada por hora del día
    let averageSpeed = 25; // km/h base
    const hour = new Date().getHours();
    
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
      averageSpeed = 15; // Hora pico
    } else if (hour >= 0 && hour <= 6) {
      averageSpeed = 35; // Madrugada
    }
    
    const estimatedMinutes = Math.round((distance / averageSpeed) * 60);
    
    if (estimatedMinutes < 1) return 'Menos de 1 min';
    if (estimatedMinutes === 1) return '1 min';
    if (estimatedMinutes < 60) return `${estimatedMinutes} min`;
    
    const hours = Math.floor(estimatedMinutes / 60);
    const mins = estimatedMinutes % 60;
    return `${hours}h ${mins}min`;
  }

  /**
   * Iniciar todos los tipos de seguimiento
   */
  private startTracking() {
    console.log('🚀 Iniciando seguimiento completo');
    
    this.getCurrentUserLocation();
    this.startTripPolling();
    this.startLocationTracking();
  }

  /**
   * Obtener ubicación actual del usuario
   */
  private getCurrentUserLocation() {
    this.isLoadingLocation = true;
    
    this.geolocationService.getStaticLocation().subscribe({
      next: (coordinates) => {
        this.userLocation = coordinates;
        this.isLoadingLocation = false;
        
        console.log(`📍 Ubicación obtenida: ${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`);
        
        if (this.trip) {
          this.calculateDistanceToDestination();
        }
      },
      error: (error) => {
        this.isLoadingLocation = false;
        console.warn('⚠️ Error obteniendo ubicación:', error.message);
      }
    });
  }

  /**
   * Polling periódico del estado del viaje
   */
  private startTripPolling() {
    this.tripPollingSubscription = interval(this.TRIP_POLLING_INTERVAL).subscribe(() => {
      this.updateTripStatus();
    });
  }

  /**
   * Seguimiento continuo de ubicación del usuario
   */
  private startLocationTracking() {
    this.isTrackingUser = true;
    
    this.locationTrackingSubscription = interval(this.LOCATION_TRACKING_INTERVAL).subscribe(() => {
      this.updateUserLocation();
    });
  }

  /**
   * Actualizar estado del viaje desde el servidor
   */
  private updateTripStatus() {
    if (!this.tripId) return;
    
    this.tripService.getTripById(this.tripId).subscribe({
      next: (trip) => {
        const previousStatus = this.trip?.status;
        this.trip = trip;
        
        if (previousStatus !== trip.status) {
          this.handleStatusChange(trip.status);
        }
      },
      error: (error) => {
        console.warn('⚠️ Error actualizando viaje:', error.message);
      }
    });
  }

  /**
   * Actualizar ubicación del usuario en background
   */
  private updateUserLocation() {
    this.geolocationService.getDynamicLocation().subscribe({
      next: (coordinates) => {
        this.userLocation = coordinates;
        
        if (this.trip) {
          this.calculateDistanceToDestination();
        }
      },
      error: (error) => {
        console.warn('⚠️ Error actualizando ubicación:', error.message);
      }
    });
  }

  /**
   * Calcular distancia al destino y ETA
   */
  private calculateDistanceToDestination() {
    if (!this.userLocation || !this.trip) return;
    
    const destination: LocationCoordinates = {
      latitude: this.trip.destinationLatitude,
      longitude: this.trip.destinationLongitude
    };
    
    this.distanceToDestination = this.geolocationService.calculateDistance(
      this.userLocation,
      destination
    );
    
    this.estimatedArrival = this.calculateEstimatedArrival();
    
    console.log(`📏 Distancia: ${this.distanceToDestination.toFixed(1)}km | ETA: ${this.estimatedArrival}`);
  }

  /**
   * Detener todas las subscripciones y polling
   */
  private stopAllTracking() {
    this.isTrackingUser = false;
    
    if (this.tripPollingSubscription) {
      this.tripPollingSubscription.unsubscribe();
    }
    
    if (this.locationTrackingSubscription) {
      this.locationTrackingSubscription.unsubscribe();
    }
  }

  // ===== MÉTODOS PÚBLICOS PARA EL TEMPLATE =====

  centerOnMyLocation() {
    console.log('🎯 Actualizando ubicación por usuario');
    this.getCurrentUserLocation();
  }

  refreshTracking() {
    console.log('🔄 Refrescando seguimiento por usuario');
    this.updateTripStatus();
    this.getCurrentUserLocation();
  }

  goToTripStatus() {
    this.router.navigate(['/trip-status', this.tripId]);
  }

  goHome() {
    this.stopAllTracking();
    this.router.navigate(['/home']);
  }

  callDriver() {
    if (this.trip?.driverPhone) {
      window.open(`tel:${this.trip.driverPhone}`);
    }
  }

  // ===== MÉTODOS PARA FORMATEO Y ESTADO =====

  formatDistance(distance: number): string {
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  }

  getGPSStatus(): string {
    if (this.isLoadingLocation) return 'Conectando...';
    if (!this.userLocation) return 'Sin GPS';
    
    const accuracy = this.userLocation.accuracy || 0;
    if (accuracy <= 10) return 'Excelente';
    if (accuracy <= 50) return 'Buena';
    if (accuracy <= 100) return 'Regular';
    return 'Baja';
  }

  getGPSStatusClass(): string {
    const status = this.getGPSStatus();
    switch (status) {
      case 'Excelente': return 'text-success';
      case 'Buena': return 'text-info';
      case 'Regular': return 'text-warning';
      case 'Baja': return 'text-danger';
      default: return 'text-muted';
    }
  }

  hasValidLocations(): boolean {
    return this.userLocation !== null && this.trip !== null;
  }

  getFormattedCoordinates(location: LocationCoordinates | null): string {
    if (!location) return 'N/A';
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
  }
}
