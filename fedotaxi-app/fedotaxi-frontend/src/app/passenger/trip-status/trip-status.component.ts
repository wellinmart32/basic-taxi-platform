import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import * as L from 'leaflet';

import { BaseMapComponent } from '../../core/components/base-map/base-map.component';
import { MapService } from '../../core/services/map/map.service';
import { GeolocationService, LocationCoordinates } from '../../core/services/geolocation/geolocation.service';
import { TripService } from '../../core/services/trip/trip.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { Trip } from '../../core/models/trip/Trip.model';
import { TripStatus } from '../../core/enums/trip-status.enum';

@Component({
  selector: 'app-trip-status',
  standalone: true,
  imports: [CommonModule, BaseMapComponent],
  templateUrl: './trip-status.component.html',
  styleUrls: ['./trip-status.component.scss']
})
export class TripStatusComponent implements OnInit, OnDestroy {
  
  // Datos del viaje
  trip: Trip | null = null;
  tripId: number | null = null;
  isLoading = true;
  isLoadingAction = false;
  errorMessage = '';
  successMessage = '';
  
  // Estados para el template
  TripStatus = TripStatus;
  
  // Polling para actualizar estado
  private pollingSubscription?: Subscription;
  private readonly POLLING_INTERVAL = 10000; // 10 segundos
  
  // Usuario actual
  currentUserId: number | null = null;
  isPassenger = false;
  isDriver = false;

  // Propiedades de mapas y ubicación
  userLocation: LocationCoordinates | null = null;
  isLoadingLocation = false;
  locationUpdateTime: Date | null = null;
  isMapFullscreen = false;
  showFullscreenToggle = false;
  
  // Tracking de ubicación
  private locationTrackingSubscription?: Subscription;
  private readonly LOCATION_TRACKING_INTERVAL = 15000; // 15 segundos
  private isLocationTrackingActive = false;
  private trackingStartTime: Date | null = null;
  
  // Estado del mapa
  private tripMap: L.Map | null = null;
  private isMapReady = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private tripService: TripService,
    private authService: AuthService,
    private mapService: MapService,
    private geolocationService: GeolocationService
  ) {}

  ngOnInit() {
    console.log('🚖 [TRIP-STATUS] Componente iniciado');
    
    // Obtener información del usuario actual
    this.currentUserId = this.authService.getCurrentUserId();
    this.isPassenger = this.authService.isPassenger();
    this.isDriver = this.authService.isDriver();
    
    // Obtener ID del viaje desde la URL
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.tripId = parseInt(id);
        console.log('🆔 [TRIP-STATUS] Trip ID obtenido:', this.tripId);
        this.loadTripDetails();
        this.startPolling();
      } else {
        console.error('❌ [TRIP-STATUS] No se encontró ID del viaje en la URL');
        this.errorMessage = 'ID del viaje no válido';
        this.router.navigate(['/home']);
      }
    });
  }

  ngOnDestroy() {
    console.log('🗑️ [TRIP-STATUS] Destruyendo componente');
    this.stopAllTracking();
    this.stopPolling();
    
    if (this.tripMap && this.isMapReady) {
      this.mapService.destroyMap('trip-status-map');
    }
  }

  // ===== MÉTODOS PRINCIPALES =====

  /**
   * Carga los detalles del viaje con inicialización de GPS
   */
  loadTripDetails() {
    if (!this.tripId) return;
    
    console.log('📋 [TRIP-STATUS] Cargando detalles del viaje');
    
    this.tripService.getTripById(this.tripId).subscribe({
      next: (trip) => {
        const previousStatus = this.trip?.status;
        this.trip = trip;
        this.isLoading = false;
        this.errorMessage = '';
        
        console.log('✅ [TRIP-STATUS] Viaje cargado:', trip);
        
        this.handleTripStatusChange(trip.status, previousStatus);
        
        if (this.isMapReady && this.showTripMap()) {
          this.setupTripMap();
        }
        
        // Verificar si el viaje está completado o cancelado para detener polling
        if (trip.status === TripStatus.COMPLETED || trip.status === TripStatus.CANCELLED) {
          this.stopPolling();
          this.stopLocationTracking();
        }
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ [TRIP-STATUS] Error cargando viaje:', error);
        
        if (error.status === 404) {
          this.errorMessage = 'Viaje no encontrado';
        } else if (error.status === 403) {
          this.errorMessage = 'No tienes permiso para ver este viaje';
        } else {
          this.errorMessage = 'Error al cargar el viaje';
        }
        
        setTimeout(() => {
          this.router.navigate(['/home']);
        }, 3000);
      }
    });
  }

  /**
   * Maneja cambios de estado del viaje
   */
  private handleTripStatusChange(newStatus: TripStatus, previousStatus?: TripStatus): void {
    console.log('🔄 [TRIP-STATUS] Cambio de estado:', previousStatus, '->', newStatus);
    
    switch (newStatus) {
      case TripStatus.REQUESTED:
        if (!this.userLocation) {
          this.getInitialUserLocation();
        }
        break;
        
      case TripStatus.ACCEPTED:
        this.getInitialUserLocation();
        if (!this.isLocationTrackingActive) {
          this.startLocationTracking();
        }
        break;
        
      case TripStatus.IN_PROGRESS:
        this.geolocationService.enableDynamicMode();
        this.getInitialUserLocation();
        if (!this.isLocationTrackingActive) {
          this.startLocationTracking();
        }
        break;
        
      case TripStatus.COMPLETED:
      case TripStatus.CANCELLED:
        this.geolocationService.disableDynamicMode();
        this.stopLocationTracking();
        break;
    }
  }

  // ===== MÉTODOS DE MAPAS =====

  /**
   * Callback cuando el mapa está listo
   */
  onTripMapReady(map: L.Map): void {
    console.log('🗺️ [TRIP-STATUS] Mapa del viaje listo');
    this.tripMap = map;
    this.isMapReady = true;
    
    if (this.trip) {
      this.setupTripMap();
    }
  }

  /**
   * Configura marcadores y ruta del viaje en el mapa
   */
  private setupTripMap(): void {
    if (!this.tripMap || !this.trip) return;
    
    console.log('🗺️ [TRIP-STATUS] Configurando mapa del viaje');
    
    // Limpiar mapa
    this.mapService.clearMarkers('trip-status-map');
    this.mapService.clearRoutes('trip-status-map');
    
    // Agregar marcadores del viaje
    const origin: LocationCoordinates = {
      latitude: this.trip.originLatitude,
      longitude: this.trip.originLongitude
    };
    
    const destination: LocationCoordinates = {
      latitude: this.trip.destinationLatitude,
      longitude: this.trip.destinationLongitude
    };
    
    // Agregar marcadores de origen y destino
    this.mapService.addTripMarkers(
      'trip-status-map',
      origin,
      destination,
      this.trip.originAddress,
      this.trip.destinationAddress
    );
    
    // Dibujar ruta del viaje
    this.mapService.drawTripRoute('trip-status-map', origin, destination);
    
    // Agregar marcador de usuario si existe
    if (this.userLocation) {
      this.updateUserMarkerOnMap();
    }
    
    // Ajustar vista del mapa
    this.mapService.fitToMarkers('trip-status-map', 50);
    
    console.log('✅ [TRIP-STATUS] Mapa configurado exitosamente');
  }

  /**
   * Actualiza el marcador de usuario en el mapa
   */
  private updateUserMarkerOnMap(): void {
    if (!this.userLocation || !this.isMapReady) return;
    
    console.log('📍 [TRIP-STATUS] Actualizando marcador de usuario');
    
    this.mapService.addUserMarker('trip-status-map', this.userLocation, 'Tu ubicación');
  }

  /**
   * Obtiene el centro del mapa basado en el viaje
   */
  getTripMapCenter(): [number, number] {
    if (this.userLocation) {
      return [this.userLocation.latitude, this.userLocation.longitude];
    }
    
    if (this.trip) {
      // Usar punto medio entre origen y destino
      const centerLat = (this.trip.originLatitude + this.trip.destinationLatitude) / 2;
      const centerLng = (this.trip.originLongitude + this.trip.destinationLongitude) / 2;
      return [centerLat, centerLng];
    }
    
    return [-2.1962, -79.8862]; // Guayaquil por defecto
  }

  /**
   * Obtiene el zoom apropiado para el mapa
   */
  getTripMapZoom(): number {
    if (!this.trip) return 13;
    
    // Calcular distancia del viaje para determinar zoom apropiado
    const distance = this.geolocationService.calculateDistance(
      { latitude: this.trip.originLatitude, longitude: this.trip.originLongitude },
      { latitude: this.trip.destinationLatitude, longitude: this.trip.destinationLongitude }
    );
    
    // Ajustar zoom según distancia
    if (distance < 2) return 15;      // Viajes cortos - zoom alto
    if (distance < 10) return 13;     // Viajes medianos - zoom medio
    if (distance < 25) return 11;     // Viajes largos - zoom bajo
    return 9;                         // Viajes muy largos - zoom muy bajo
  }

  /**
   * Obtiene la altura del mapa (responsive)
   */
  getMapHeight(): number {
    if (this.isMapFullscreen) {
      return window.innerHeight - 100; // Dejar espacio para header
    }
    
    // Altura responsive según el estado del viaje
    if (this.trip?.status === TripStatus.IN_PROGRESS) {
      return 400; // Más alto durante el viaje
    }
    
    return 350; // Altura estándar
  }

  /**
   * Toggle del modo pantalla completa
   */
  toggleFullscreenMap(): void {
    this.isMapFullscreen = !this.isMapFullscreen;
    
    console.log('📺 [TRIP-STATUS] Toggle fullscreen:', this.isMapFullscreen);
    
    // Invalidar tamaño del mapa después de cambio
    setTimeout(() => {
      if (this.tripMap) {
        this.tripMap.invalidateSize();
        
        // Reajustar vista
        if (this.trip) {
          this.mapService.fitToMarkers('trip-status-map', 50);
        }
      }
    }, 300);
  }

  // ===== MÉTODOS DE GEOLOCALIZACIÓN =====

  /**
   * Obtiene la ubicación inicial del usuario
   */
  private getInitialUserLocation(): void {
    if (this.userLocation) {
      console.log('📍 [TRIP-STATUS] Ya tenemos ubicación, saltando obtención inicial');
      return;
    }
    
    console.log('📍 [TRIP-STATUS] Obteniendo ubicación inicial del usuario');
    
    this.isLoadingLocation = true;
    
    // Usar modo apropiado según estado del viaje
    const locationObservable = this.trip?.status === TripStatus.IN_PROGRESS 
      ? this.geolocationService.getDynamicLocation()
      : this.geolocationService.getStaticLocation();
    
    locationObservable.subscribe({
      next: (coordinates) => {
        this.processLocationUpdate(coordinates, 'INICIAL');
      },
      error: (geoError) => {
        this.isLoadingLocation = false;
        console.warn('⚠️ [TRIP-STATUS] Error obteniendo ubicación inicial:', geoError);
        
        if (geoError.userMessage) {
          this.showTemporaryMessage(`GPS: ${geoError.userMessage}`, 'warning');
        }
      }
    });
  }

  /**
   * Actualiza la ubicación del usuario (manual)
   */
  updateUserLocation(): void {
    console.log('🔄 [TRIP-STATUS] Actualizando ubicación manualmente');
    
    this.isLoadingLocation = true;
    
    // Forzar obtención de ubicación fresca
    const mode = this.trip?.status === TripStatus.IN_PROGRESS ? 'dynamic' : 'static';
    
    this.geolocationService.getFreshLocation(mode).subscribe({
      next: (coordinates) => {
        this.processLocationUpdate(coordinates, 'MANUAL');
        this.showTemporaryMessage('Ubicación actualizada', 'success');
      },
      error: (geoError) => {
        this.isLoadingLocation = false;
        console.error('❌ [TRIP-STATUS] Error actualizando ubicación:', geoError);
        this.showTemporaryMessage(geoError.userMessage || 'Error actualizando ubicación', 'error');
      }
    });
  }

  /**
   * Refresca la ubicación del viaje (alias)
   */
  refreshTripLocation(): void {
    this.updateUserLocation();
  }

  /**
   * Procesa la actualización de ubicación
   */
  private processLocationUpdate(coordinates: LocationCoordinates, source: string): void {
    console.log('📍 [TRIP-STATUS] Procesando actualización de ubicación:', source);
    
    // Validar coordenadas
    if (!this.geolocationService.isValidCoordinates(coordinates)) {
      console.error('❌ [TRIP-STATUS] Coordenadas inválidas recibidas');
      this.isLoadingLocation = false;
      return;
    }
    
    // Actualizar datos locales
    this.userLocation = coordinates;
    this.locationUpdateTime = new Date();
    this.isLoadingLocation = false;
    
    // Verificar que esté en Ecuador
    if (!this.geolocationService.isInEcuador(coordinates)) {
      console.warn('⚠️ [TRIP-STATUS] Ubicación fuera de Ecuador');
      this.showTemporaryMessage('Tu ubicación parece estar fuera de Ecuador', 'warning');
    }
    
    // Actualizar mapa
    if (this.isMapReady && this.showTripMap()) {
      this.updateUserMarkerOnMap();
    }
    
    console.log('✅ [TRIP-STATUS] Ubicación procesada exitosamente:', source);
  }

  /**
   * Inicia el tracking automático de ubicación
   */
  private startLocationTracking(): void {
    if (this.isLocationTrackingActive) {
      console.log('⚠️ [TRIP-STATUS] Tracking ya está activo');
      return;
    }
    
    console.log('🚀 [TRIP-STATUS] Iniciando tracking automático');
    
    this.isLocationTrackingActive = true;
    this.trackingStartTime = new Date();
    
    this.locationTrackingSubscription = interval(this.LOCATION_TRACKING_INTERVAL).subscribe(() => {
      console.log('📍 [TRIP-STATUS] Tracking automático - actualizando ubicación');
      
      // Solo hacer tracking si el viaje está activo
      if (this.trip && 
          [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS].includes(this.trip.status)) {
        
        const method = this.trip.status === TripStatus.IN_PROGRESS 
          ? this.geolocationService.getDynamicLocation()
          : this.geolocationService.getStaticLocation();
        
        method.subscribe({
          next: (coordinates) => {
            // Solo actualizar si hay cambio significativo
            if (this.hasLocationChangedSignificantly(coordinates)) {
              this.processLocationUpdate(coordinates, 'AUTO');
            }
          },
          error: (error) => {
            console.warn('⚠️ [TRIP-STATUS] Error en tracking automático:', error);
          }
        });
      }
    });
    
    console.log('✅ [TRIP-STATUS] Tracking automático iniciado');
  }

  /**
   * Detiene el tracking automático
   */
  private stopLocationTracking(): void {
    if (!this.isLocationTrackingActive) return;
    
    console.log('⏹️ [TRIP-STATUS] Deteniendo tracking automático');
    
    this.isLocationTrackingActive = false;
    this.trackingStartTime = null;
    
    if (this.locationTrackingSubscription) {
      this.locationTrackingSubscription.unsubscribe();
      this.locationTrackingSubscription = undefined;
    }
  }

  /**
   * Detiene todo el tracking
   */
  private stopAllTracking(): void {
    this.stopLocationTracking();
    this.geolocationService.disableDynamicMode();
  }

  /**
   * Verifica cambio significativo en ubicación
   */
  private hasLocationChangedSignificantly(newCoords: LocationCoordinates): boolean {
    if (!this.userLocation) return true;
    
    const distance = this.geolocationService.calculateDistance(
      this.userLocation,
      newCoords
    );
    
    // Considerar cambio significativo si es mayor a 10 metros
    return distance > 0.01; // 0.01 km = 10 metros
  }

  /**
   * Toggle del tracking manual
   */
  toggleLocationTracking(): void {
    if (this.isLocationTrackingActive) {
      console.log('⏸️ [TRIP-STATUS] Usuario pausó tracking');
      this.stopLocationTracking();
      this.showTemporaryMessage('Tracking pausado', 'info');
    } else {
      console.log('▶️ [TRIP-STATUS] Usuario reanudó tracking');
      this.startLocationTracking();
      this.showTemporaryMessage('Tracking activado', 'success');
    }
  }

  // ===== MÉTODOS AUXILIARES =====

  /**
   * Muestra un mensaje temporal
   */
  private showTemporaryMessage(message: string, type: 'success' | 'error' | 'warning' | 'info'): void {
    if (type === 'success' || type === 'info') {
      this.successMessage = message;
      this.errorMessage = '';
    } else {
      this.errorMessage = message;
      this.successMessage = '';
    }
    
    setTimeout(() => {
      if (type === 'success' || type === 'info') {
        if (this.successMessage === message) {
          this.successMessage = '';
        }
      } else {
        if (this.errorMessage === message) {
          this.errorMessage = '';
        }
      }
    }, 3000);
  }

  // ===== MÉTODOS DE POLLING =====

  /**
   * Inicia el polling para actualizar estado
   */
  private startPolling() {
    console.log('🔄 [TRIP-STATUS] Iniciando polling');
    
    this.pollingSubscription = interval(this.POLLING_INTERVAL).subscribe(() => {
      console.log('🔄 [TRIP-STATUS] Actualizando estado del viaje');
      this.loadTripDetails();
    });
  }

  /**
   * Detiene el polling
   */
  private stopPolling() {
    if (this.pollingSubscription) {
      console.log('⏹️ [TRIP-STATUS] Deteniendo polling');
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = undefined;
    }
  }

  // ===== ACCIONES DEL VIAJE =====

  /**
   * Cancela el viaje (solo si está permitido)
   */
  cancelTrip() {
    if (!this.trip || !this.canCancelTrip()) return;
    
    const confirmMessage = this.isDriver 
      ? '¿Estás seguro de que deseas cancelar este viaje? El pasajero será notificado.'
      : '¿Estás seguro de que deseas cancelar este viaje?';
    
    if (!confirm(confirmMessage)) return;
    
    console.log('❌ [TRIP-STATUS] Cancelando viaje');
    this.isLoadingAction = true;
    
    this.tripService.cancelTrip(this.trip.id).subscribe({
      next: (updatedTrip) => {
        this.trip = updatedTrip;
        this.isLoadingAction = false;
        this.successMessage = 'Viaje cancelado exitosamente';
        
        console.log('✅ [TRIP-STATUS] Viaje cancelado');
        
        this.stopAllTracking();
        
        this.stopPolling();
        setTimeout(() => {
          this.router.navigate(['/home']);
        }, 2000);
      },
      error: (error) => {
        this.isLoadingAction = false;
        console.error('❌ [TRIP-STATUS] Error cancelando viaje:', error);
        this.errorMessage = 'Error al cancelar el viaje';
      }
    });
  }

  /**
   * Verifica si se puede cancelar el viaje
   */
  canCancelTrip(): boolean {
    if (!this.trip) return false;
    
    // No se puede cancelar un viaje completado
    if (this.trip.status === TripStatus.COMPLETED) return false;
    
    // Solo el pasajero o conductor pueden cancelar
    if (this.isPassenger && this.trip.passengerId === this.currentUserId) return true;
    if (this.isDriver && this.trip.driverId === this.currentUserId) return true;
    
    return false;
  }

  /**
   * Llama al conductor
   */
  callDriver() {
    if (this.trip?.driverPhone) {
      window.open(`tel:${this.trip.driverPhone}`);
    }
  }

  /**
   * Navega al tracking con mejores condiciones
   */
  goToTracking() {
    if (this.trip && this.trip.status === TripStatus.IN_PROGRESS) {
      console.log('🗺️ [TRIP-STATUS] Navegando a tracking del viaje:', this.trip.id);
      this.router.navigate(['/ride-tracking', this.trip.id]);
    }
  }

  /**
   * Refresca con mejor feedback
   */
  refreshStatus() {
    console.log('🔄 [TRIP-STATUS] Refrescando manualmente');
    
    this.showTemporaryMessage('Actualizando estado...', 'info');
    this.loadTripDetails();
  }

  /**
   * Verifica si el usuario puede realizar acciones en este viaje
   */
  canInteractWithTrip(): boolean {
    if (!this.trip || !this.currentUserId) return false;
    
    // El pasajero puede interactuar si es su viaje
    if (this.isPassenger && this.trip.passengerId === this.currentUserId) return true;
    
    // El conductor puede interactuar si es su viaje
    if (this.isDriver && this.trip.driverId === this.currentUserId) return true;
    
    return false;
  }

  /**
   * Obtiene acciones disponibles según estado y rol
   */
  getAvailableActions(): string[] {
    if (!this.trip || !this.canInteractWithTrip()) return [];
    
    const actions: string[] = [];
    
    // Acciones según estado del viaje
    switch (this.trip.status) {
      case TripStatus.REQUESTED:
        if (this.isPassenger) actions.push('cancel');
        break;
        
      case TripStatus.ACCEPTED:
        actions.push('track');
        if (this.canCancelTrip()) actions.push('cancel');
        break;
        
      case TripStatus.IN_PROGRESS:
        actions.push('track');
        break;
        
      case TripStatus.COMPLETED:
        actions.push('history', 'review');
        break;
        
      case TripStatus.CANCELLED:
        actions.push('history');
        break;
    }
    
    return actions;
  }

  /**
   * Vuelve al home
   */
  goHome() {
    this.router.navigate(['/home']);
  }

  /**
   * Ve el historial de viajes
   */
  goToHistory() {
    this.router.navigate(['/ride-history']);
  }

  // ===== MÉTODOS PARA EL TEMPLATE =====

  /**
   * Determina si mostrar el mapa
   */
  showTripMap(): boolean {
    if (!this.trip) return false;
    
    // Mostrar mapa para viajes aceptados, en progreso y completados recientemente
    return [
      TripStatus.ACCEPTED, 
      TripStatus.IN_PROGRESS, 
      TripStatus.COMPLETED
    ].includes(this.trip.status);
  }

  /**
   * Verifica si tiene ubicación de usuario
   */
  hasUserLocation(): boolean {
    return this.userLocation !== null;
  }

  /**
   * Verifica si tiene ubicación del conductor
   */
  hasDriverLocation(): boolean {
    // Por ahora retornamos false, se puede implementar si el backend provee ubicación del conductor
    return false;
  }

  /**
   * Obtiene el estado del GPS
   */
  getGPSStatus(): string {
    if (this.isLoadingLocation) return 'Conectando...';
    if (!this.userLocation) return 'Sin GPS';
    
    const accuracy = this.userLocation.accuracy || 0;
    if (accuracy <= 10) return 'Excelente';
    if (accuracy <= 50) return 'Buena';
    if (accuracy <= 100) return 'Regular';
    return 'Baja';
  }

  /**
   * Obtiene la precisión de ubicación
   */
  getLocationAccuracy(): string {
    if (!this.userLocation) return 'N/A';
    
    const accuracy = this.userLocation.accuracy;
    if (!accuracy) return 'N/A';
    
    return `±${Math.round(accuracy)}m`;
  }

  /**
   * Obtiene la edad de la ubicación
   */
  getUserLocationAge(): string {
    if (!this.locationUpdateTime) return '';
    
    const ageMs = Date.now() - this.locationUpdateTime.getTime();
    const ageMinutes = Math.round(ageMs / 60000);
    
    if (ageMinutes < 1) return 'Ahora';
    if (ageMinutes === 1) return 'Hace 1 minuto';
    return `Hace ${ageMinutes} minutos`;
  }

  /**
   * Obtiene el texto de ubicación de usuario
   */
  getUserLocationText(): string {
    if (!this.userLocation) return 'Sin ubicación';
    
    const coords = `${this.userLocation.latitude.toFixed(6)}, ${this.userLocation.longitude.toFixed(6)}`;
    const accuracy = this.userLocation.accuracy ? ` (±${Math.round(this.userLocation.accuracy)}m)` : '';
    
    return coords + accuracy;
  }

  /**
   * Obtiene coordenadas de usuario para debug
   */
  getUserLocationCoords(): string {
    if (!this.userLocation) return '';
    return `${this.userLocation.latitude.toFixed(6)}, ${this.userLocation.longitude.toFixed(6)}`;
  }

  /**
   * Obtiene la edad de ubicación del conductor
   */
  getDriverLocationAge(): string {
    // Por implementar cuando el backend provea ubicación del conductor
    return 'No disponible';
  }

  /**
   * Verifica si está habilitado el tracking
   */
  isTrackingEnabled(): boolean {
    return this.isLocationTrackingActive;
  }

  /**
   * Muestra el toggle de tracking
   */
  showTrackingToggle(): boolean {
    if (!this.trip) return false;
    
    // Solo mostrar toggle durante viajes activos
    return [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS].includes(this.trip.status);
  }

  /**
   * Muestra información de tracking
   */
  showTrackingInfo(): boolean {
    if (!this.trip) return false;
    
    // Mostrar info de tracking durante viajes activos o si hay ubicación
    return [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS].includes(this.trip.status) || 
           this.hasUserLocation();
  }

  /**
   * Verifica si se puede refrescar ubicación
   */
  canRefreshLocation(): boolean {
    if (!this.trip) return false;
    
    // Permitir refrescar durante viajes activos
    return [TripStatus.ACCEPTED, TripStatus.IN_PROGRESS].includes(this.trip.status);
  }

  /**
   * Calcula la distancia al destino
   */
  getDistanceToDestination(): string {
    if (!this.userLocation || !this.trip) return 'N/A';
    
    const destination: LocationCoordinates = {
      latitude: this.trip.destinationLatitude,
      longitude: this.trip.destinationLongitude
    };
    
    const distance = this.geolocationService.calculateDistance(
      this.userLocation,
      destination
    );
    
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  }

  /**
   * Calcula el tiempo estimado de llegada
   */
  getEstimatedArrival(): string {
    if (!this.userLocation || !this.trip) return 'N/A';
    
    const destination: LocationCoordinates = {
      latitude: this.trip.destinationLatitude,
      longitude: this.trip.destinationLongitude
    };
    
    const distance = this.geolocationService.calculateDistance(
      this.userLocation,
      destination
    );
    
    // Velocidad promedio estimada (considerando tráfico urbano)
    let averageSpeed = 25; // km/h base
    
    // Ajustar velocidad según hora del día
    const hour = new Date().getHours();
    if (hour >= 7 && hour <= 9) averageSpeed = 15; // Hora pico mañana
    else if (hour >= 17 && hour <= 19) averageSpeed = 15; // Hora pico tarde
    else if (hour >= 0 && hour <= 6) averageSpeed = 35; // Madrugada
    
    const estimatedMinutes = Math.round((distance / averageSpeed) * 60);
    
    if (estimatedMinutes < 1) return 'Menos de 1 min';
    if (estimatedMinutes === 1) return '1 min';
    if (estimatedMinutes < 60) return `${estimatedMinutes} min`;
    
    const hours = Math.floor(estimatedMinutes / 60);
    const mins = estimatedMinutes % 60;
    return `${hours}h ${mins}min`;
  }

  /**
   * Obtiene información del progreso del viaje
   */
  getTripProgressInfo(): string {
    if (!this.userLocation || !this.trip) return 'Sin datos de ubicación';
    
    const distanceToDestination = this.getDistanceToDestination();
    const estimatedTime = this.getEstimatedArrival();
    
    return `${distanceToDestination} restantes • ETA: ${estimatedTime}`;
  }

  /**
   * Debug del estado del viaje con mapas
   */
  debugTripState(): void {
    console.log('\n🚖 ===== TRIP-STATUS DEBUG =====');
    console.log('Estado del componente:');
    console.log('  - Trip ID:', this.tripId);
    console.log('  - Trip status:', this.trip?.status);
    console.log('  - Usuario ID:', this.currentUserId);
    console.log('  - Es pasajero:', this.isPassenger);
    console.log('  - Es conductor:', this.isDriver);
    
    console.log('  === MAPA Y UBICACIÓN ===');
    console.log('  - Mapa listo:', this.isMapReady);
    console.log('  - Mostrar mapa:', this.showTripMap());
    console.log('  - Ubicación usuario:', this.userLocation);
    console.log('  - Tiempo ubicación:', this.locationUpdateTime);
    console.log('  - Cargando ubicación:', this.isLoadingLocation);
    console.log('  - Estado GPS:', this.getGPSStatus());
    console.log('  - Precisión:', this.getLocationAccuracy());
    
    console.log('  === TRACKING ===');
    console.log('  - Tracking activo:', this.isLocationTrackingActive);
    console.log('  - Tiempo inicio tracking:', this.trackingStartTime);
    console.log('  - Mostrar toggle tracking:', this.showTrackingToggle());
    console.log('  - Puede refrescar ubicación:', this.canRefreshLocation());
    
    console.log('  === VIAJE ===');
    console.log('  - Acciones disponibles:', this.getAvailableActions());
    console.log('  - Puede cancelar:', this.canCancelTrip());
    console.log('  - Puede interactuar:', this.canInteractWithTrip());
    console.log('  - Distancia al destino:', this.getDistanceToDestination());
    console.log('  - ETA:', this.getEstimatedArrival());
    
    if (this.trip) {
      console.log('  === COORDENADAS VIAJE ===');
      console.log('  - Origen:', this.trip.originLatitude, this.trip.originLongitude);
      console.log('  - Destino:', this.trip.destinationLatitude, this.trip.destinationLongitude);
      console.log('  - Centro mapa:', this.getTripMapCenter());
      console.log('  - Zoom mapa:', this.getTripMapZoom());
    }
    
    console.log('🚖 ===== END DEBUG =====\n');
  }

  // ===== MÉTODOS PARA EL TEMPLATE =====

  /**
   * Obtiene el texto del estado
   */
  getStatusText(): string {
    if (!this.trip) return 'Cargando...';
    
    switch (this.trip.status) {
      case TripStatus.REQUESTED:
        return 'Buscando conductor...';
      case TripStatus.ACCEPTED:
        return 'Conductor asignado';
      case TripStatus.IN_PROGRESS:
        return 'Viaje en progreso';
      case TripStatus.COMPLETED:
        return 'Viaje completado';
      case TripStatus.CANCELLED:
        return 'Viaje cancelado';
      default:
        return 'Estado desconocido';
    }
  }

  /**
   * Obtiene el color del estado
   */
  getStatusColor(): string {
    if (!this.trip) return 'secondary';
    
    switch (this.trip.status) {
      case TripStatus.REQUESTED:
        return 'warning';
      case TripStatus.ACCEPTED:
        return 'info';
      case TripStatus.IN_PROGRESS:
        return 'primary';
      case TripStatus.COMPLETED:
        return 'success';
      case TripStatus.CANCELLED:
        return 'danger';
      default:
        return 'secondary';
    }
  }

  /**
   * Obtiene el icono del estado
   */
  getStatusIcon(): string {
    if (!this.trip) return 'fas fa-spinner';
    
    switch (this.trip.status) {
      case TripStatus.REQUESTED:
        return 'fas fa-search';
      case TripStatus.ACCEPTED:
        return 'fas fa-check-circle';
      case TripStatus.IN_PROGRESS:
        return 'fas fa-car';
      case TripStatus.COMPLETED:
        return 'fas fa-flag-checkered';
      case TripStatus.CANCELLED:
        return 'fas fa-times-circle';
      default:
        return 'fas fa-question-circle';
    }
  }

  /**
   * Obtiene mensaje descriptivo según el estado
   */
  getDescriptiveMessage(): string {
    if (!this.trip) return '';
    
    switch (this.trip.status) {
      case TripStatus.REQUESTED:
        return 'Estamos buscando el mejor conductor disponible cerca de ti. Esto puede tomar unos minutos.';
      case TripStatus.ACCEPTED:
        return `Tu conductor ${this.trip.driverName} está en camino al punto de recogida.`;
      case TripStatus.IN_PROGRESS:
        return `${this.trip.driverName} te está llevando a tu destino. ¡Disfruta el viaje!`;
      case TripStatus.COMPLETED:
        return '¡Tu viaje ha sido completado exitosamente! Esperamos que hayas tenido una buena experiencia.';
      case TripStatus.CANCELLED:
        return 'El viaje ha sido cancelado. Puedes solicitar un nuevo viaje cuando gustes.';
      default:
        return 'Estado del viaje no disponible.';
    }
  }

  /**
   * Verifica si se puede hacer seguimiento
   */
  canTrackTrip(): boolean {
    return this.trip?.status === TripStatus.IN_PROGRESS;
  }

  /**
   * Verifica si se debe mostrar información del conductor
   */
  shouldShowDriverInfo(): boolean {
    return this.trip !== null && 
           this.trip.status !== TripStatus.REQUESTED && 
           this.trip.status !== TripStatus.CANCELLED &&
           this.trip.driverName !== undefined;
  }

  /**
   * Formatea el tiempo
   */
  formatTime(date: Date | string | undefined): string {
    if (!date) return 'N/A';
    
    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else {
      dateObj = date;
    }
    
    return dateObj.toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Obtiene la hora actual formateada
   */
  getCurrentTimeFormatted(): string {
    return new Date().toLocaleTimeString('es-EC', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Formatea la tarifa
   */
  formatFare(fare: number | undefined): string {
    if (!fare) return 'N/A';
    return `${fare.toFixed(2)}`;
  }

  /**
   * Formatea la distancia
   */
  formatDistance(distance: number | undefined): string {
    if (!distance) return 'N/A';
    return `${distance.toFixed(1)} km`;
  }
}
