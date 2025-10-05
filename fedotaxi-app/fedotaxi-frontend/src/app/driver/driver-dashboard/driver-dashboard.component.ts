import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { TripService } from '../../core/services/trip/trip.service';
import { DriverService } from '../../core/services/driver/driver.service';
import { GeolocationService, LocationCoordinates } from '../../core/services/geolocation/geolocation.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { TripStatus } from '../../core/enums/trip-status.enum';
import { Trip } from '../../core/models/trip/Trip.model';

@Component({
  selector: 'app-driver-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './driver-dashboard.component.html',
  styleUrls: ['./driver-dashboard.component.scss']
})
export class DriverDashboardComponent implements OnInit, OnDestroy {
  
  // Estado del conductor
  currentTrip: Trip | null = null;
  availableTrips: Trip[] = [];
  assignedTrip: Trip | null = null;
  isAvailable = false;
  
  // Estados de carga
  isLoading = false;
  isLoadingAvailability = false;
  isLoadingLocation = false;
  errorMessage = '';
  successMessage = '';
  
  // Información de ubicación GPS
  currentLocation: LocationCoordinates | null = null;
  locationUpdateTime: Date | null = null;
  locationObtainedOnce = false;
  
  // Control de modo GPS
  private gpsMode: 'static' | 'dynamic' = 'static';
  
  // Polling inteligente
  private pollingSubscription?: Subscription;
  
  // Enums para el template
  TripStatus = TripStatus;
  
  constructor(
    private tripService: TripService,
    private driverService: DriverService,
    private geolocationService: GeolocationService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    console.log('🚖 [DRIVER-DASHBOARD] Iniciado');
    this.checkDriverStatus();
    this.loadAvailableTrips();
    this.startIntelligentPolling();
  }

  ngOnDestroy() {
    console.log('🗑️ [DRIVER-DASHBOARD] Destruido');
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
    }
    this.geolocationService.disableDynamicMode();
  }

  // ===== MÉTODOS DE INICIALIZACIÓN =====

  /**
   * Verifica el estado del conductor con GPS solo si es necesario
   */
  checkDriverStatus() {
    this.driverService.getMyDriverInfo().subscribe({
      next: (driver) => {
        this.isAvailable = driver.available;
        
        console.log('✅ [DRIVER-DASHBOARD] Estado del conductor cargado:', {
          available: this.isAvailable,
          dbLocation: driver.currentLatitude ? `${driver.currentLatitude}, ${driver.currentLongitude}` : 'No disponible'
        });
        
        if (this.isAvailable && !this.locationObtainedOnce) {
          console.log('🎯 [DRIVER-DASHBOARD] Conductor disponible, obteniendo GPS inicial');
          this.getInitialStaticLocation();
        } else {
          console.log('💤 [DRIVER-DASHBOARD] Conductor no disponible, sin GPS inicial');
        }
      },
      error: (error) => {
        console.error('❌ [DRIVER-DASHBOARD] Error obteniendo perfil del conductor:', error);
        this.errorMessage = 'Error al cargar tu perfil de conductor';
      }
    });
  }

  /**
   * Obtiene la ubicación estática inicial una sola vez
   */
  private getInitialStaticLocation(): void {
    console.log('📍 [DRIVER-DASHBOARD] Obteniendo ubicación estática inicial');
    
    this.isLoadingLocation = true;
    this.geolocationService.getStaticLocation().subscribe({
      next: (coordinates) => {
        console.log('✅ [DRIVER-DASHBOARD] GPS estático inicial obtenido');
        this.processLocationUpdate(coordinates, 'GPS_ESTATICO_INICIAL');
        this.locationObtainedOnce = true;
      },
      error: (geoError) => {
        this.isLoadingLocation = false;
        console.error('❌ [DRIVER-DASHBOARD] Error obteniendo GPS estático inicial:', geoError);
        this.errorMessage = geoError.userMessage || 'Error obteniendo ubicación GPS inicial';
        setTimeout(() => this.errorMessage = '', 5000);
      }
    });
  }

  /**
   * Carga viajes disponibles y asignados
   */
  loadAvailableTrips() {
    this.tripService.getMyTrips().subscribe({
      next: (trips) => {
        const currentUserId = this.authService.getCurrentUserId();
        
        // Buscar viaje asignado pendiente de aceptar
        this.assignedTrip = trips.find(trip => 
          trip.driverId === currentUserId &&
          trip.status === TripStatus.REQUESTED
        ) || null;
        
        // Viajes disponibles para aceptar (sin conductor asignado)
        this.availableTrips = trips.filter(trip => 
          trip.status === TripStatus.REQUESTED && !trip.driverId
        );
        
        // Verificar si hay un viaje actual en progreso
        this.currentTrip = trips.find(trip => 
          trip.driverId === currentUserId &&
          [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS].includes(trip.status)
        ) || null;
        
        console.log('✅ [DRIVER-DASHBOARD] Estado actualizado:', {
          assignedTrip: this.assignedTrip?.id,
          availableTrips: this.availableTrips.length,
          currentTrip: this.currentTrip?.id
        });
        
        this.updateGPSModeBasedOnTripStatus();
        
        // Calcular distancias a viajes disponibles
        if (this.availableTrips.length > 0 && this.currentLocation) {
          this.calculateDistancesToTrips();
        }
      },
      error: (error) => {
        console.error('❌ [DRIVER-DASHBOARD] Error cargando viajes:', error);
        this.errorMessage = 'Error al cargar viajes disponibles';
      }
    });
  }

  /**
   * Actualiza el modo GPS según el estado del conductor
   */
  private updateGPSModeBasedOnTripStatus(): void {
    const hasActiveTrip = this.assignedTrip || this.currentTrip;
    
    if (hasActiveTrip && this.gpsMode !== 'dynamic') {
      console.log('🚀 [DRIVER-DASHBOARD] Activando modo GPS dinámico (viaje activo)');
      this.gpsMode = 'dynamic';
      this.geolocationService.enableDynamicMode();
    } else if (!hasActiveTrip && this.gpsMode !== 'static') {
      console.log('🛑 [DRIVER-DASHBOARD] Activando modo GPS estático (sin viaje activo)');
      this.gpsMode = 'static';
      this.geolocationService.disableDynamicMode();
    }
  }

  /**
   * Calcula distancias a viajes disponibles
   */
  private calculateDistancesToTrips() {
    if (!this.currentLocation) return;
    
    this.availableTrips.forEach(trip => {
      if (trip.originLatitude && trip.originLongitude) {
        const tripOrigin: LocationCoordinates = {
          latitude: trip.originLatitude,
          longitude: trip.originLongitude
        };
        
        const distance = this.geolocationService.calculateDistance(
          this.currentLocation!,
          tripOrigin
        );
        
        (trip as any).distanceToOrigin = distance;
      }
    });
  }

  // ===== MÉTODOS DE CONTROL DE DISPONIBILIDAD =====

  /**
   * Cambia la disponibilidad con GPS inteligente
   */
  toggleAvailability() {
    const newStatus = !this.isAvailable;
    console.log('🔄 [DRIVER-DASHBOARD] Cambiando disponibilidad a:', newStatus);
    
    this.isLoadingAvailability = true;
    
    this.driverService.updateAvailability(newStatus).subscribe({
      next: () => {
        this.isAvailable = newStatus;
        this.isLoadingAvailability = false;
        
        const message = this.isAvailable 
          ? 'Ahora estás disponible para recibir solicitudes de viaje' 
          : 'Ya no recibirás solicitudes de viaje';
        
        this.successMessage = message;
        setTimeout(() => this.successMessage = '', 3000);
        
        // GPS inteligente según disponibilidad
        if (newStatus && !this.locationObtainedOnce) {
          this.getInitialStaticLocation();
        } else if (newStatus && this.locationObtainedOnce) {
          this.refreshLocationIfNeeded();
        } else if (!newStatus) {
          this.availableTrips = [];
          this.geolocationService.disableDynamicMode();
          this.gpsMode = 'static';
        }
        
        this.loadAvailableTrips();
        
        console.log('✅ [DRIVER-DASHBOARD] Disponibilidad actualizada:', newStatus);
      },
      error: (error) => {
        this.isLoadingAvailability = false;
        console.error('❌ [DRIVER-DASHBOARD] Error actualizando disponibilidad:', error);
        this.errorMessage = 'Error al actualizar tu disponibilidad';
      }
    });
  }

  // ===== MÉTODOS DE UBICACIÓN =====

  /**
   * Actualización manual de ubicación
   */
  quickLocationUpdate() {
    console.log('⚡ [DRIVER-DASHBOARD] Actualización manual de ubicación');
    
    this.isLoadingLocation = true;
    
    const locationObservable = this.gpsMode === 'dynamic' 
      ? this.geolocationService.getDynamicLocation()
      : this.geolocationService.getFreshLocation('static');
    
    locationObservable.subscribe({
      next: (coordinates) => {
        console.log('✅ [DRIVER-DASHBOARD] GPS manual obtenido');
        this.processLocationUpdate(coordinates, 'GPS_MANUAL');
      },
      error: (geoError) => {
        this.isLoadingLocation = false;
        console.error('❌ [DRIVER-DASHBOARD] Error obteniendo GPS manual:', geoError);
        this.errorMessage = geoError.userMessage || 'Error obteniendo ubicación GPS';
        setTimeout(() => this.errorMessage = '', 5000);
      }
    });
  }

  /**
   * Actualiza ubicación solo si es necesario
   */
  private refreshLocationIfNeeded(): void {
    if (!this.locationUpdateTime) return;
    
    const ageMs = Date.now() - this.locationUpdateTime.getTime();
    const shouldRefresh = this.gpsMode === 'dynamic' ? ageMs > 30000 : ageMs > 300000; // 30s dinámico, 5min estático
    
    if (shouldRefresh) {
      console.log('🔄 [DRIVER-DASHBOARD] Refrescando ubicación (necesario por edad)');
      this.quickLocationUpdate();
    }
  }

  /**
   * Procesa la actualización de ubicación
   */
  private processLocationUpdate(coordinates: LocationCoordinates, source: string = 'GPS') {
    console.log('🔄 [DRIVER-DASHBOARD] Procesando actualización de ubicación:', source);
    
    // Validación para Ecuador
    const isInEcuador = this.geolocationService.isInEcuador(coordinates);
    
    if (!isInEcuador) {
      console.warn('⚠️ [DRIVER-DASHBOARD] Ubicación fuera de Ecuador');
      this.errorMessage = 'Tu ubicación parece estar fuera de Ecuador. ¿Es correcto?';
      setTimeout(() => this.errorMessage = '', 5000);
    }
    
    // Actualizar ubicación local
    this.currentLocation = coordinates;
    this.locationUpdateTime = new Date();
    
    console.log('💾 [DRIVER-DASHBOARD] Ubicación local actualizada');
    
    // Enviar al servidor
    this.driverService.updateLocation(coordinates.latitude, coordinates.longitude).subscribe({
      next: () => {
        this.isLoadingLocation = false;
        
        const accuracyText = coordinates.accuracy ? 
          ` (±${Math.round(coordinates.accuracy)}m)` : '';
        
        this.successMessage = `Ubicación ${source} actualizada${accuracyText}`;
        setTimeout(() => this.successMessage = '', 3000);
        
        console.log('✅ [DRIVER-DASHBOARD] Ubicación actualizada en servidor');
      },
      error: (error) => {
        this.isLoadingLocation = false;
        console.error('❌ [DRIVER-DASHBOARD] Error actualizando ubicación en servidor:', error);
        this.errorMessage = 'Error al actualizar la ubicación en el servidor';
      }
    });
  }

  /**
   * Actualización automática durante viajes
   */
  private updateLocationForActiveTrip(): void {
    if (!this.hasActiveTrip || this.gpsMode !== 'dynamic') {
      return;
    }
    
    console.log('🚗 [DRIVER-DASHBOARD] Actualizando ubicación automática (viaje activo)');
    
    this.geolocationService.getDynamicLocation().subscribe({
      next: (coordinates) => {
        // Solo procesar si las coordenadas han cambiado significativamente
        if (this.hasLocationChangedSignificantly(coordinates)) {
          console.log('📍 [DRIVER-DASHBOARD] Coordenadas cambiaron significativamente');
          this.processLocationUpdate(coordinates, 'GPS_AUTO_VIAJE');
        } else {
          console.log('📍 [DRIVER-DASHBOARD] Coordenadas sin cambios significativos');
        }
      },
      error: (error) => {
        console.warn('⚠️ [DRIVER-DASHBOARD] Error en actualización automática:', error);
      }
    });
  }

  /**
   * Verifica si la ubicación ha cambiado significativamente
   */
  private hasLocationChangedSignificantly(newCoords: LocationCoordinates): boolean {
    if (!this.currentLocation) return true;
    
    const distance = this.geolocationService.calculateDistance(
      this.currentLocation,
      newCoords
    );
    
    // Considerar cambio significativo si es mayor a 20 metros
    return distance > 0.02; // 0.02 km = 20 metros
  }

  // ===== MÉTODOS DE GESTIÓN DE VIAJES =====

  /**
   * Acepta el viaje asignado
   */
  acceptAssignedTrip() {
    if (!this.assignedTrip) return;
    
    console.log('✅ [DRIVER-DASHBOARD] Aceptando viaje asignado:', this.assignedTrip.id);
    this.isLoading = true;
    
    this.tripService.updateTripStatus(this.assignedTrip.id, TripStatus.ACCEPTED).subscribe({
      next: (trip) => {
        this.isLoading = false;
        this.currentTrip = trip;
        this.assignedTrip = null;
        this.successMessage = '¡Viaje aceptado! Dirígete al punto de origen.';
        
        // Activar modo dinámico para tracking
        console.log('🚀 [DRIVER-DASHBOARD] Activando tracking GPS dinámico');
        this.gpsMode = 'dynamic';
        this.geolocationService.enableDynamicMode();
        
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ [DRIVER-DASHBOARD] Error aceptando viaje asignado:', error);
        this.errorMessage = 'Error al aceptar el viaje asignado';
      }
    });
  }

  /**
   * Rechaza el viaje asignado
   */
  rejectAssignedTrip() {
    if (!this.assignedTrip) return;
    
    if (!confirm('¿Estás seguro de que deseas rechazar este viaje?')) return;
    
    console.log('❌ [DRIVER-DASHBOARD] Rechazando viaje asignado:', this.assignedTrip.id);
    this.isLoading = true;
    
    this.tripService.updateTripStatus(this.assignedTrip.id, TripStatus.CANCELLED).subscribe({
      next: () => {
        this.isLoading = false;
        this.assignedTrip = null;
        this.successMessage = 'Viaje rechazado. Sigues disponible para nuevos viajes.';
        
        // Volver a modo estático
        console.log('🛑 [DRIVER-DASHBOARD] Volviendo a modo GPS estático');
        this.gpsMode = 'static';
        this.geolocationService.disableDynamicMode();
        
        // Reactivar disponibilidad automáticamente
        this.driverService.updateAvailability(true).subscribe({
          next: () => {
            this.isAvailable = true;
            this.loadAvailableTrips();
          }
        });
        
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ [DRIVER-DASHBOARD] Error rechazando viaje asignado:', error);
        this.errorMessage = 'Error al rechazar el viaje asignado';
      }
    });
  }

  /**
   * Acepta un viaje disponible
   */
  acceptTrip(tripId: number) {
    console.log('✅ [DRIVER-DASHBOARD] Aceptando viaje disponible:', tripId);
    this.isLoading = true;
    
    this.tripService.updateTripStatus(tripId, TripStatus.ACCEPTED).subscribe({
      next: (trip) => {
        this.isLoading = false;
        this.currentTrip = trip;
        this.successMessage = '¡Viaje aceptado! Dirígete al punto de origen.';
        
        // Activar modo dinámico
        console.log('🚀 [DRIVER-DASHBOARD] Activando tracking GPS dinámico');
        this.gpsMode = 'dynamic';
        this.geolocationService.enableDynamicMode();
        
        this.loadAvailableTrips();
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ [DRIVER-DASHBOARD] Error aceptando viaje:', error);
        this.errorMessage = 'Error al aceptar el viaje. Puede que ya haya sido tomado.';
        this.loadAvailableTrips();
      }
    });
  }

  /**
   * Inicia el viaje
   */
  startTrip() {
    if (!this.currentTrip) return;
    
    console.log('🚀 [DRIVER-DASHBOARD] Iniciando viaje:', this.currentTrip.id);
    this.isLoading = true;
    
    this.tripService.updateTripStatus(this.currentTrip.id, TripStatus.IN_PROGRESS).subscribe({
      next: (trip) => {
        this.isLoading = false;
        this.currentTrip = trip;
        this.successMessage = '¡Viaje iniciado! Dirígete al destino.';
        
        // GPS dinámico ya debería estar activo, pero confirmar
        if (this.gpsMode !== 'dynamic') {
          console.log('🚀 [DRIVER-DASHBOARD] Asegurando GPS dinámico activo');
          this.gpsMode = 'dynamic';
          this.geolocationService.enableDynamicMode();
        }
        
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ [DRIVER-DASHBOARD] Error iniciando viaje:', error);
        this.errorMessage = 'Error al iniciar el viaje';
      }
    });
  }

  /**
   * Completa el viaje
   */
  completeTrip() {
    if (!this.currentTrip) return;
    
    console.log('🏁 [DRIVER-DASHBOARD] Completando viaje:', this.currentTrip.id);
    this.isLoading = true;
    
    this.tripService.updateTripStatus(this.currentTrip.id, TripStatus.COMPLETED).subscribe({
      next: () => {
        this.isLoading = false;
        this.successMessage = '¡Viaje completado exitosamente!';
        this.currentTrip = null;
        
        // Volver a modo estático
        console.log('🛑 [DRIVER-DASHBOARD] Viaje completado, volviendo a modo GPS estático');
        this.gpsMode = 'static';
        this.geolocationService.disableDynamicMode();
        
        this.loadAvailableTrips();
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ [DRIVER-DASHBOARD] Error completando viaje:', error);
        this.errorMessage = 'Error al completar el viaje';
      }
    });
  }

  /**
   * Cancela el viaje
   */
  cancelTrip() {
    if (!this.currentTrip) return;
    
    if (!confirm('¿Estás seguro de que deseas cancelar este viaje?')) return;
    
    console.log('❌ [DRIVER-DASHBOARD] Cancelando viaje:', this.currentTrip.id);
    this.isLoading = true;
    
    this.tripService.updateTripStatus(this.currentTrip.id, TripStatus.CANCELLED).subscribe({
      next: () => {
        this.isLoading = false;
        this.successMessage = 'Viaje cancelado';
        this.currentTrip = null;
        
        // Volver a modo estático
        console.log('🛑 [DRIVER-DASHBOARD] Viaje cancelado, volviendo a modo GPS estático');
        this.gpsMode = 'static';
        this.geolocationService.disableDynamicMode();
        
        this.loadAvailableTrips();
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ [DRIVER-DASHBOARD] Error cancelando viaje:', error);
        this.errorMessage = 'Error al cancelar el viaje';
      }
    });
  }

  // ===== POLLING INTELIGENTE =====

  /**
   * Inicia el polling inteligente según estado
   */
  private startIntelligentPolling() {
    const pollingInterval = 5000; // 5 segundos
    
    this.pollingSubscription = interval(pollingInterval).subscribe(() => {
      // Solo hacer polling si está disponible o tiene viajes activos
      if (this.isAvailable || this.assignedTrip || this.currentTrip) {
        console.log('🔄 [DRIVER-DASHBOARD] Polling inteligente - actualizando estado');
        this.loadAvailableTrips();
        
        // GPS inteligente según modo
        if (this.hasActiveTrip && this.gpsMode === 'dynamic') {
          // Actualización automática durante viajes activos
          this.updateLocationForActiveTrip();
        } else if (this.shouldUpdateLocationInPolling()) {
          // Actualización menos frecuente en modo estático
          this.refreshLocationIfNeeded();
        }
      }
    });
    
    console.log(`🔄 [DRIVER-DASHBOARD] Polling inteligente iniciado cada ${pollingInterval}ms`);
  }

  /**
   * Determina si debe actualizar ubicación en polling
   */
  private shouldUpdateLocationInPolling(): boolean {
    if (!this.locationUpdateTime) return false;
    
    const timeSinceUpdate = Date.now() - this.locationUpdateTime.getTime();
    
    // En modo estático: actualizar cada 2 minutos
    // En modo dinámico: actualizar cada 30 segundos (pero esto se maneja en updateLocationForActiveTrip)
    const threshold = this.gpsMode === 'static' ? 120000 : 30000;
    
    return timeSinceUpdate > threshold;
  }

  // ===== NAVEGACIÓN =====

  /**
   * Va al home
   */
  goHome() {
    this.router.navigate(['/home']);
  }

  /**
   * Refresca el estado del dashboard
   */
  refreshTracking() {
    console.log('🔄 [DRIVER-DASHBOARD] Refrescando estado manualmente');
    
    // Invalidar cache de conductores
    this.driverService.clearDriversCache();
    
    // Recargar datos
    this.checkDriverStatus();
    this.loadAvailableTrips();
    
    // Si tiene ubicación, refrescarla también
    if (this.locationObtainedOnce) {
      this.quickLocationUpdate();
    }
  }

  /**
   * Método para header (alias de quickLocationUpdate)
   */
  updateLocation() {
    console.log('📍 [DRIVER-DASHBOARD] Actualizando ubicación desde header');
    this.quickLocationUpdate();
  }

  // ===== MÉTODOS PARA EL TEMPLATE =====

  /**
   * Formatea la distancia
   */
  formatDistance(distance: number): string {
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  }

  /**
   * Obtiene la distancia estimada del viaje
   */
  getEstimatedDistance(trip: Trip): number {
    // Si ya calculamos la distancia al origen, usarla
    if ((trip as any).distanceToOrigin) {
      return (trip as any).distanceToOrigin;
    }
    
    // Si no, calcular distancia del viaje completo
    if (trip.originLatitude && trip.originLongitude && 
        trip.destinationLatitude && trip.destinationLongitude) {
      
      const origin: LocationCoordinates = {
        latitude: trip.originLatitude,
        longitude: trip.originLongitude
      };
      
      const destination: LocationCoordinates = {
        latitude: trip.destinationLatitude,
        longitude: trip.destinationLongitude
      };
      
      return this.geolocationService.calculateDistance(origin, destination);
    }
    
    return 0;
  }

  /**
   * Calcula la tarifa estimada
   */
  getEstimatedFare(trip: Trip): number {
    const distance = this.getEstimatedDistance(trip);
    const baseFare = 2.50; // Tarifa base
    const perKmRate = 0.80; // Por kilómetro
    return baseFare + (distance * perKmRate);
  }

  /**
   * Obtiene la distancia hasta el origen de un viaje
   */
  getDistanceToTrip(trip: Trip): string {
    const distance = (trip as any).distanceToOrigin;
    if (distance) {
      return `${distance.toFixed(1)}km`;
    }
    return '';
  }

  /**
   * Obtiene el nombre completo del conductor (para compatibilidad)
   */
  getDriverFullName(driver: any): string {
    if (!driver) return '';
    return `${driver.firstName || ''} ${driver.lastName || ''}`.trim();
  }

  /**
   * Obtiene información de ubicación actual
   */
  getLocationInfo(): string {
    if (!this.currentLocation) {
      return 'Sin ubicación';
    }
    
    const coords = `${this.currentLocation.latitude.toFixed(6)}, ${this.currentLocation.longitude.toFixed(6)}`;
    const accuracy = this.currentLocation.accuracy ? ` (±${Math.round(this.currentLocation.accuracy)}m)` : '';
    
    return coords + accuracy;
  }

  /**
   * Tiempo desde la última actualización de ubicación
   */
  getLocationAge(): string {
    if (!this.locationUpdateTime) return '';
    
    const ageMs = Date.now() - this.locationUpdateTime.getTime();
    const ageMinutes = Math.round(ageMs / 60000);
    
    if (ageMinutes < 1) return 'Ahora';
    if (ageMinutes === 1) return 'Hace 1 minuto';
    return `Hace ${ageMinutes} minutos`;
  }

  /**
   * Obtiene el estado de la conexión GPS
   */
  getGPSStatus(): string {
    if (this.isLoadingLocation) return 'Conectando...';
    if (!this.currentLocation) return 'Sin GPS';
    
    const accuracy = this.currentLocation.accuracy || 0;
    if (accuracy <= 10) return 'Excelente';
    if (accuracy <= 50) return 'Buena';
    if (accuracy <= 100) return 'Regular';
    return 'Baja';
  }

  /**
   * Verifica si la ubicación está en Ecuador
   */
  isLocationInEcuador(): boolean {
    if (!this.currentLocation) return false;
    return this.geolocationService.isInEcuador(this.currentLocation);
  }

  /**
   * Obtiene información del modo GPS
   */
  getGPSModeInfo(): string {
    const modeText = this.gpsMode === 'dynamic' ? 'DINÁMICO (tracking)' : 'ESTÁTICO (disponible)';
    return `Modo GPS: ${modeText}`;
  }

  /**
   * Obtiene tiempo de actualización apropiado para el modo
   */
  getUpdateFrequencyInfo(): string {
    if (this.gpsMode === 'dynamic') {
      return 'Actualización automática cada 30s';
    } else {
      return 'Actualización manual o cada 2min';
    }
  }

  // ===== GETTERS PARA EL TEMPLATE =====
  
  get hasLocation(): boolean {
    return this.currentLocation !== null;
  }
  
  get locationStatusText(): string {
    if (this.isLoadingLocation) return 'Actualizando ubicación...';
    if (!this.currentLocation) return 'Sin ubicación';
    if (!this.isLocationInEcuador()) return 'Ubicación fuera de Ecuador';
    
    const modeInfo = this.gpsMode === 'dynamic' ? ' (TRACKING)' : ' (ESTÁTICO)';
    return `Ubicación actualizada ${this.getLocationAge()}${modeInfo}`;
  }
  
  get canUpdateLocation(): boolean {
    return !this.isLoadingLocation;
  }
  
  get hasAssignedTrip(): boolean {
    return this.assignedTrip !== null;
  }
  
  get hasCurrentTrip(): boolean {
    return this.currentTrip !== null;
  }

  get hasActiveTrip(): boolean {
    return this.hasAssignedTrip || this.hasCurrentTrip;
  }

  get gpsCurrentMode(): string {
    return this.gpsMode;
  }

  get isDynamicMode(): boolean {
    return this.gpsMode === 'dynamic';
  }

  /**
   * Debug información completa
   */
  debugDriverState(): void {
    console.log('\n🚖 ===== DRIVER-DASHBOARD DEBUG =====');
    console.log('Estado del conductor:');
    console.log('  - Disponible:', this.isAvailable);
    console.log('  - Viaje asignado:', this.assignedTrip?.id);
    console.log('  - Viaje actual:', this.currentTrip?.id);
    console.log('  - Viajes disponibles:', this.availableTrips.length);
    console.log('  - Ubicación actual:', this.currentLocation);
    console.log('  - Ubicación obtenida:', this.locationUpdateTime);
    console.log('  - Ubicación obtenida una vez:', this.locationObtainedOnce);
    console.log('  - Modo GPS:', this.gpsMode);
    console.log('  - GPS dinámico activo:', this.isDynamicMode);
    console.log('  - Tiene viaje activo:', this.hasActiveTrip);
    console.log('  - Edad ubicación:', this.getLocationAge());
    console.log('  - Estado GPS:', this.getGPSStatus());
    console.log('  - En Ecuador:', this.isLocationInEcuador());
    console.log('🚖 ===== END DEBUG =====\n');
  }
}
