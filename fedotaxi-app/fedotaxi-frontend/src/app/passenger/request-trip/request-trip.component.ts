import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import * as L from 'leaflet';

import { BaseMapComponent } from 'src/app/core/components/base-map/base-map.component';
import { MapService } from '../../core/services/map/map.service';
import { TripService } from '../../core/services/trip/trip.service';
import { DriverService, SearchResult } from '../../core/services/driver/driver.service';
import { GeolocationService, LocationCoordinates } from '../../core/services/geolocation/geolocation.service';
import { TripRequest } from '../../core/models/trip/trip-request.model';
import { Driver } from '../../core/models/driver/driver.model';

@Component({
  selector: 'app-request-trip',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, BaseMapComponent],
  templateUrl: './request-trip.component.html',
  styleUrls: ['./request-trip.component.scss']
})
export class RequestTripComponent implements OnInit, OnDestroy {
  tripForm: FormGroup;
  isLoading = false;
  isLoadingLocation = false;
  errorMessage = '';
  successMessage = '';
  
  // Estados del proceso
  step: 'form' | 'searching' | 'drivers' | 'requesting' = 'form';
  nearbyDrivers: Driver[] = [];
  searchResult: SearchResult | null = null;
  
  // Ubicación estática obtenida una vez
  userLocation: LocationCoordinates | null = null;
  locationObtainedTime: Date | null = null;
  
  // Estados de selección UX
  originMode: 'gps' | 'manual' = 'gps';
  isSelectingDestination = false;
  destinationSet = false;
  originConfirmed = true; // GPS confirmado por defecto
  lastSelectedLocation: LocationCoordinates | null = null;
  
  // Polling automático de conductores
  private driverPollingSubscription?: Subscription;
  private readonly POLLING_INTERVAL = 12000; // 12 segundos
  private isPollingActive = false;
  private pollingCounter = 0;
  private lastDriverIds: number[] = [];
  
  // Estados del polling
  isPollingDrivers = false;
  lastPollingTime: Date | null = null;
  driversChangedCount = 0;

  // Mapas
  private mainMap: L.Map | null = null;
  private driversMap: L.Map | null = null;
  
  constructor(
    private formBuilder: FormBuilder,
    private tripService: TripService,
    private driverService: DriverService,
    private geolocationService: GeolocationService,
    private mapService: MapService,
    private router: Router
  ) {
    this.tripForm = this.formBuilder.group({
      originAddress: ['', [Validators.required, Validators.minLength(5)]],
      destinationAddress: ['', [Validators.required, Validators.minLength(5)]],
      originLatitude: [0, Validators.required],
      originLongitude: [0, Validators.required],
      destinationLatitude: [0, Validators.required],
      destinationLongitude: [0, Validators.required]
    });
  }

  ngOnInit() {
    console.log('🚖 [REQUEST-TRIP] Componente iniciado');
    this.getStaticLocationOnce();
    this.setupManualGeocoding();
  }

  ngOnDestroy() {
    console.log('🗑️ [REQUEST-TRIP] Destruyendo componente');
    this.stopDriverPolling();
  }

  // ===== MÉTODOS DE UX PARA SELECCIÓN DE DESTINO =====

  /**
   * Inicia la selección de destino en el mapa
   */
  startDestinationSelection(): void {
    console.log('🎯 [REQUEST-TRIP] Iniciando selección de destino');
    
    if (!this.canStartDestinationSelection) {
      console.warn('⚠️ [REQUEST-TRIP] No se puede iniciar selección de destino');
      return;
    }
    
    this.isSelectingDestination = true;
    this.lastSelectedLocation = null;
    this.destinationSet = false;
    
    this.tripForm.patchValue({
      destinationAddress: '',
      destinationLatitude: 0,
      destinationLongitude: 0
    });
    
    this.showTemporaryMessage('Haz clic en el mapa para seleccionar tu destino', 'info');
  }

  /**
   * Confirma la ubicación seleccionada como destino
   */
  confirmSelectedDestination(): void {
    console.log('✅ [REQUEST-TRIP] Confirmando destino seleccionado');
    
    if (!this.canConfirmDestination || !this.lastSelectedLocation) {
      console.warn('⚠️ [REQUEST-TRIP] No se puede confirmar destino');
      return;
    }
    
    const coords = this.lastSelectedLocation;
    const address = `Ubicación del mapa (${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)})`;
    
    this.tripForm.patchValue({
      destinationAddress: address,
      destinationLatitude: coords.latitude,
      destinationLongitude: coords.longitude
    });
    
    this.destinationSet = true;
    this.isSelectingDestination = false;
    this.lastSelectedLocation = null;
    
    this.updateMainMapMarkers();
    this.showTemporaryMessage('Destino confirmado exitosamente', 'success');
  }

  /**
   * Cancela la selección de destino
   */
  cancelDestinationSelection(): void {
    console.log('❌ [REQUEST-TRIP] Cancelando selección de destino');
    
    this.isSelectingDestination = false;
    this.lastSelectedLocation = null;
    
    if (this.tripForm.value.destinationLatitude && this.tripForm.value.destinationLongitude) {
      this.destinationSet = true;
    }
    
    this.showTemporaryMessage('Selección de destino cancelada', 'info');
  }

  /**
   * Limpia el destino establecido
   */
  clearDestination(): void {
    console.log('🧹 [REQUEST-TRIP] Limpiando destino');
    
    this.tripForm.patchValue({
      destinationAddress: '',
      destinationLatitude: 0,
      destinationLongitude: 0
    });
    
    this.destinationSet = false;
    this.isSelectingDestination = false;
    this.lastSelectedLocation = null;
    
    this.updateMainMapMarkers();
    this.showTemporaryMessage('Destino eliminado', 'info');
  }

  /**
   * Cambia el origen a modo manual
   */
  changeOriginToManual(): void {
    console.log('✏️ [REQUEST-TRIP] Cambiando origen a modo manual');
    
    this.originMode = 'manual';
    this.originConfirmed = false;
    
    this.tripForm.patchValue({
      originAddress: '',
      originLatitude: 0,
      originLongitude: 0
    });
    
    this.showTemporaryMessage('Modo manual activado. Ingresa tu dirección de origen', 'info');
  }

  /**
   * Usa GPS como origen
   */
  useGPSAsOrigin(): void {
    console.log('📡 [REQUEST-TRIP] Usando GPS como origen');
    
    if (!this.userLocation) {
      console.log('📍 [REQUEST-TRIP] Sin ubicación GPS, obteniendo...');
      this.getStaticLocationOnce();
      return;
    }
    
    this.originMode = 'gps';
    this.originConfirmed = true;
    
    this.setOriginFromStaticGPS();
    this.updateMainMapMarkers();
    
    this.showTemporaryMessage('Origen establecido desde GPS', 'success');
  }

  /**
   * Obtiene el texto de la ubicación seleccionada
   */
  getSelectedLocationText(): string {
    if (!this.lastSelectedLocation) return '';
    
    const { latitude, longitude } = this.lastSelectedLocation;
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }

  // ===== MÉTODOS DE MAPAS =====

  /**
   * Configura el mapa principal cuando está listo
   */
  onMapReady(map: L.Map): void {
    console.log('🗺️ [REQUEST-TRIP] Mapa principal listo');
    this.mainMap = map;
    this.setupMainMap();
  }

  /**
   * Configura el mapa de conductores cuando está listo
   */
  onDriversMapReady(map: L.Map): void {
    console.log('🗺️ [REQUEST-TRIP] Mapa de conductores listo');
    this.driversMap = map;
    this.setupDriversMap();
  }

  /**
   * Configura el mapa principal
   */
  private setupMainMap(): void {
    if (!this.mainMap || !this.userLocation) return;
    
    console.log('🗺️ [REQUEST-TRIP] Configurando mapa principal');
    
    this.mapService.addUserMarker('request-trip-map', this.userLocation);
    this.updateMainMapMarkers();
  }

  /**
   * Maneja la selección de ubicación en el mapa (solo para destino)
   */
  onLocationSelected(coordinates: LocationCoordinates): void {
    console.log('🗺️ [REQUEST-TRIP] Ubicación seleccionada:', coordinates);
    
    if (!this.isSelectingDestination) {
      console.log('🚫 [REQUEST-TRIP] Mapa no está en modo selección');
      return;
    }
    
    this.lastSelectedLocation = coordinates;
    this.addTemporaryDestinationMarker(coordinates);
    
    console.log('📍 [REQUEST-TRIP] Ubicación temporal guardada');
  }

  /**
   * Agrega marcador temporal de destino
   */
  private addTemporaryDestinationMarker(coordinates: LocationCoordinates): void {
    if (!this.mainMap) return;
    
    this.mapService.removeMarker('request-trip-map', 'temp-destination');
    
    this.mapService.addMarker('request-trip-map', 'temp-destination', {
      coordinates: [coordinates.latitude, coordinates.longitude],
      title: 'Destino temporal',
      popup: `Destino temporal<br>${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`,
      icon: this.mapService.getIcons().destination
    });
  }

  /**
   * Actualiza los marcadores en el mapa principal
   */
  private updateMainMapMarkers(): void {
    if (!this.mainMap) return;
    
    const originCoords = this.getOriginCoordinates();
    const destCoords = this.getDestinationCoordinates();
    
    // Limpiar marcadores del viaje
    this.mapService.removeMarker('request-trip-map', 'trip-origin');
    this.mapService.removeMarker('request-trip-map', 'trip-destination');
    this.mapService.removeMarker('request-trip-map', 'temp-destination');
    this.mapService.clearRoutes('request-trip-map');
    
    if (originCoords && destCoords) {
      this.updateTripMarkersOnMainMap(originCoords, destCoords);
    } else if (originCoords) {
      this.mapService.addMarker('request-trip-map', 'trip-origin', {
        coordinates: [originCoords.latitude, originCoords.longitude],
        title: 'Origen',
        popup: `Origen: ${this.tripForm.value.originAddress}`,
        icon: this.mapService.getIcons().origin
      });
    }
  }

  /**
   * Actualiza marcadores del viaje en el mapa principal
   */
  private updateTripMarkersOnMainMap(origin: LocationCoordinates, destination: LocationCoordinates): void {
    if (!this.mainMap) return;
    
    console.log('🗺️ [REQUEST-TRIP] Actualizando marcadores del viaje');
    
    this.mapService.addTripMarkers(
      'request-trip-map',
      origin,
      destination,
      this.tripForm.value.originAddress,
      this.tripForm.value.destinationAddress
    );
    
    this.mapService.drawTripRoute('request-trip-map', origin, destination);
    this.mapService.fitToMarkers('request-trip-map', 50);
  }

  /**
   * Configura el mapa de conductores
   */
  private setupDriversMap(): void {
    if (!this.driversMap || !this.userLocation) return;
    
    console.log('🗺️ [REQUEST-TRIP] Configurando mapa de conductores');
    
    const originCoords = this.getOriginCoordinates();
    const destCoords = this.getDestinationCoordinates();
    
    if (originCoords && destCoords) {
      this.mapService.addTripMarkers(
        'drivers-map',
        originCoords,
        destCoords,
        this.tripForm.value.originAddress,
        this.tripForm.value.destinationAddress
      );
      
      this.mapService.drawTripRoute('drivers-map', originCoords, destCoords);
    }
    
    this.updateDriversOnMap();
  }

  /**
   * Actualiza los conductores en el mapa
   */
  private updateDriversOnMap(): void {
    if (!this.driversMap || this.nearbyDrivers.length === 0) return;
    
    console.log('🗺️ [REQUEST-TRIP] Actualizando conductores en mapa:', this.nearbyDrivers.length);
    
    // Limpiar conductores existentes
    this.nearbyDrivers.forEach((_, index) => {
      this.mapService.removeMarker('drivers-map', `driver-${index}`);
    });
    
    // Agregar nuevos conductores
    this.nearbyDrivers.forEach((driver, index) => {
      if (driver.currentLatitude && driver.currentLongitude) {
        const driverLocation: LocationCoordinates = {
          latitude: driver.currentLatitude,
          longitude: driver.currentLongitude
        };
        
        this.mapService.addDriverMarker(
          'drivers-map',
          index.toString(),
          driverLocation,
          `${driver.firstName} ${driver.lastName}`
        );
      }
    });
    
    this.mapService.fitToMarkers('drivers-map', 100);
  }

  /**
   * Enfoca en un conductor específico
   */
  focusOnDriver(driver: Driver): void {
    if (!this.driversMap || !driver.currentLatitude || !driver.currentLongitude) return;
    
    console.log('🎯 [REQUEST-TRIP] Enfocando en conductor:', driver.firstName);
    
    const driverLocation: LocationCoordinates = {
      latitude: driver.currentLatitude,
      longitude: driver.currentLongitude
    };
    
    this.mapService.centerMap('drivers-map', [driverLocation.latitude, driverLocation.longitude], 16);
    
    this.successMessage = `Mostrando ubicación de ${driver.firstName} ${driver.lastName}`;
    setTimeout(() => this.successMessage = '', 3000);
  }

  /**
   * Obtiene el centro del mapa basado en la ubicación del usuario
   */
  getMapCenter(): [number, number] {
    if (this.userLocation) {
      return [this.userLocation.latitude, this.userLocation.longitude];
    }
    return [-2.1962, -79.8862]; // Guayaquil por defecto
  }

  /**
   * Obtiene las coordenadas de origen del formulario
   */
  private getOriginCoordinates(): LocationCoordinates | null {
    const lat = this.tripForm.value.originLatitude;
    const lng = this.tripForm.value.originLongitude;
    
    if (lat && lng && lat !== 0 && lng !== 0) {
      return { latitude: lat, longitude: lng };
    }
    return null;
  }

  /**
   * Obtiene las coordenadas de destino del formulario
   */
  private getDestinationCoordinates(): LocationCoordinates | null {
    const lat = this.tripForm.value.destinationLatitude;
    const lng = this.tripForm.value.destinationLongitude;
    
    if (lat && lng && lat !== 0 && lng !== 0) {
      return { latitude: lat, longitude: lng };
    }
    return null;
  }

  // ===== POLLING AUTOMÁTICO DE CONDUCTORES =====

  /**
   * Inicia el polling automático de conductores
   */
  private startDriverPolling(): void {
    if (this.isPollingActive) {
      console.log('⚠️ [REQUEST-TRIP] Polling ya está activo');
      return;
    }

    console.log('🔄 [REQUEST-TRIP] Iniciando polling automático cada', this.POLLING_INTERVAL / 1000, 'segundos');
    
    this.isPollingActive = true;
    this.pollingCounter = 0;
    
    this.driverPollingSubscription = interval(this.POLLING_INTERVAL).subscribe(() => {
      this.pollingCounter++;
      console.log(`🔄 [REQUEST-TRIP] Polling #${this.pollingCounter}`);
      
      this.updateDriversList();
    });
  }

  /**
   * Detiene el polling automático
   */
  private stopDriverPolling(): void {
    if (this.driverPollingSubscription) {
      console.log('⏹️ [REQUEST-TRIP] Deteniendo polling automático');
      this.driverPollingSubscription.unsubscribe();
      this.driverPollingSubscription = undefined;
    }
    
    this.isPollingActive = false;
    this.isPollingDrivers = false;
    this.pollingCounter = 0;
  }

  /**
   * Actualiza la lista de conductores sin cambiar el paso
   */
  private updateDriversList(): void {
    if (this.step !== 'drivers' || !this.userLocation) {
      console.log('⚠️ [REQUEST-TRIP] No está en paso drivers o sin ubicación');
      return;
    }

    this.isPollingDrivers = true;
    this.lastPollingTime = new Date();
    
    const originLat = this.tripForm.value.originLatitude;
    const originLng = this.tripForm.value.originLongitude;
    
    this.driverService.findNearbyDriversIntelligent(originLat, originLng).subscribe({
      next: (result) => {
        this.isPollingDrivers = false;
        
        console.log('✅ [REQUEST-TRIP] Polling - Conductores obtenidos:', result.drivers.length);
        
        const newDriverIds = result.drivers.map(d => d.id);
        const driversChanged = this.hasDriverListChanged(newDriverIds);
        
        if (driversChanged) {
          this.driversChangedCount++;
          console.log(`🔄 [REQUEST-TRIP] Lista de conductores cambió (cambio #${this.driversChangedCount})`);
          
          this.searchResult = result;
          this.nearbyDrivers = result.drivers;
          this.lastDriverIds = newDriverIds;
          
          if (result.drivers.length > 0) {
            this.calculateDistancesToDrivers(originLat, originLng);
          }
          
          this.updateDriversOnMap();
          this.showPollingFeedback();
          
        } else {
          console.log('📋 [REQUEST-TRIP] Sin cambios en la lista de conductores');
        }
      },
      error: (error) => {
        this.isPollingDrivers = false;
        console.warn('⚠️ [REQUEST-TRIP] Error en polling:', error);
      }
    });
  }

  /**
   * Verifica si la lista de conductores cambió
   */
  private hasDriverListChanged(newDriverIds: number[]): boolean {
    if (this.lastDriverIds.length === 0) return true;
    if (newDriverIds.length !== this.lastDriverIds.length) return true;
    
    const oldSet = new Set(this.lastDriverIds);
    const newSet = new Set(newDriverIds);
    
    if (oldSet.size !== newSet.size) return true;
    
    for (const id of newSet) {
      if (!oldSet.has(id)) return true;
    }
    
    return false;
  }

  /**
   * Muestra feedback visual del polling
   */
  private showPollingFeedback(): void {
    const oldMessage = this.successMessage;
    this.successMessage = `Lista actualizada - ${this.nearbyDrivers.length} conductores disponibles`;
    
    setTimeout(() => {
      if (this.successMessage === `Lista actualizada - ${this.nearbyDrivers.length} conductores disponibles`) {
        this.successMessage = oldMessage;
      }
    }, 2000);
  }

  // ===== GEOLOCALIZACIÓN =====

  /**
   * Obtiene la ubicación estática una sola vez
   */
  private getStaticLocationOnce(): void {
    console.log('📍 [REQUEST-TRIP] Obteniendo ubicación estática');
    
    this.isLoadingLocation = true;
    
    this.geolocationService.getStaticLocation().subscribe({
      next: (coordinates) => {
        this.isLoadingLocation = false;
        this.userLocation = coordinates;
        this.locationObtainedTime = new Date();
        
        console.log('✅ [REQUEST-TRIP] Ubicación estática obtenida:', this.userLocation);
        
        if (!this.geolocationService.isInEcuador(coordinates)) {
          console.warn('⚠️ [REQUEST-TRIP] Ubicación fuera de Ecuador');
          this.errorMessage = 'Tu ubicación parece estar fuera de Ecuador. ¿Es correcto?';
        }
        
        if (this.originMode === 'gps') {
          this.setOriginFromStaticGPS();
        }
        
        if (this.mainMap) {
          this.setupMainMap();
        }
        
        if (!this.errorMessage.includes('fuera de Ecuador')) {
          this.errorMessage = '';
        }
      },
      error: (geoError) => {
        this.isLoadingLocation = false;
        console.error('❌ [REQUEST-TRIP] Error obteniendo ubicación:', geoError);
        this.errorMessage = geoError.userMessage || 'No se pudo obtener tu ubicación. Ingresa la dirección manualmente.';
      }
    });
  }

  /**
   * Establece el origen desde GPS estático
   */
  private setOriginFromStaticGPS(): void {
    if (!this.userLocation) return;

    console.log('📍 [REQUEST-TRIP] Estableciendo origen desde GPS estático');
    
    this.tripForm.patchValue({
      originLatitude: this.userLocation.latitude,
      originLongitude: this.userLocation.longitude,
      originAddress: 'Mi ubicación GPS'
    }, { emitEvent: false });
    
    this.originConfirmed = true;
  }

  /**
   * Configura la geocodificación manual
   */
  private setupManualGeocoding(): void {
    console.log('⚙️ [REQUEST-TRIP] Configurando geocodificación manual');
  }

  /**
   * Refresca la ubicación actual
   */
  refreshCurrentLocation(): void {
    console.log('🔄 [REQUEST-TRIP] Refrescando ubicación');
    
    this.geolocationService.clearCache('static');
    this.isLoadingLocation = true;
    
    this.geolocationService.getFreshLocation('static').subscribe({
      next: (coordinates) => {
        this.isLoadingLocation = false;
        this.userLocation = coordinates;
        this.locationObtainedTime = new Date();
        
        console.log('✅ [REQUEST-TRIP] Ubicación refrescada');
        
        if (this.originMode === 'gps') {
          this.setOriginFromStaticGPS();
        }
        
        if (this.mainMap) {
          this.setupMainMap();
        }
        
        this.successMessage = 'Ubicación actualizada';
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (geoError) => {
        this.isLoadingLocation = false;
        console.error('❌ [REQUEST-TRIP] Error refrescando ubicación:', geoError);
        this.errorMessage = geoError.userMessage || 'Error actualizando ubicación';
      }
    });
  }

  /**
   * Usa la ubicación actual como origen
   */
  useCurrentAsOrigin(): void {
    if (this.userLocation) {
      console.log('📍 [REQUEST-TRIP] Usando ubicación actual como origen');
      this.originMode = 'gps';
      this.setOriginFromStaticGPS();
      this.updateMainMapMarkers();
      
      this.successMessage = 'Ubicación GPS establecida como origen';
      setTimeout(() => this.successMessage = '', 3000);
    } else {
      console.log('🔄 [REQUEST-TRIP] No hay ubicación, obteniendo...');
      this.getStaticLocationOnce();
    }
  }

  /**
   * Geocodifica una dirección manualmente
   */
  geocodeAddress(address: string, isOrigin: boolean): void {
    console.log(`📍 [REQUEST-TRIP] Geocodificando: "${address}" (${isOrigin ? 'origen' : 'destino'})`);
    
    if (address === 'Mi ubicación GPS') {
      if (isOrigin && this.userLocation) {
        this.setOriginFromStaticGPS();
      }
      return;
    }

    if (!address || address.trim().length < 3) {
      console.log('📍 [REQUEST-TRIP] Dirección muy corta');
      return;
    }
    
    const coordinates = this.getCoordinatesForAddress(address);
    
    if (!this.geolocationService.isValidCoordinates(coordinates)) {
      console.error('❌ [REQUEST-TRIP] Coordenadas inválidas para:', address);
      return;
    }
    
    if (isOrigin) {
      this.tripForm.patchValue({
        originLatitude: coordinates.latitude,
        originLongitude: coordinates.longitude
      }, { emitEvent: false });
      
      this.originConfirmed = true;
    } else {
      this.tripForm.patchValue({
        destinationLatitude: coordinates.latitude,
        destinationLongitude: coordinates.longitude
      }, { emitEvent: false });
      
      this.destinationSet = true;
    }
    
    this.updateMainMapMarkers();
    
    console.log(`📍 [REQUEST-TRIP] Coordenadas ${isOrigin ? 'origen' : 'destino'}:`, coordinates);
  }

  /**
   * Obtiene coordenadas para direcciones conocidas o genera aproximadas
   */
  private getCoordinatesForAddress(address: string): LocationCoordinates {
    const addressLower = address.toLowerCase();
    
    const knownLocations: { [key: string]: LocationCoordinates } = {
      'mall del sol': { latitude: -2.0283172, longitude: -79.9643793 },
      'mall del sol, guayaquil': { latitude: -2.0283172, longitude: -79.9643793 },
      'malecón 2000': { latitude: -2.1962, longitude: -79.8862 },
      'malecon 2000': { latitude: -2.1962, longitude: -79.8862 },
      'cerro santa ana': { latitude: -2.1969, longitude: -79.8853 },
      'universidad católica': { latitude: -2.1453, longitude: -79.8831 },
      'ucsg': { latitude: -2.1453, longitude: -79.8831 },
      'aeropuerto guayaquil': { latitude: -2.1574, longitude: -79.8838 },
      'terminal terrestre': { latitude: -2.2290, longitude: -79.8906 },
      'riocentro entre ríos': { latitude: -2.1542, longitude: -79.8906 },
      'riocentro ceibos': { latitude: -2.1169, longitude: -79.9075 },
      'city mall': { latitude: -2.1169, longitude: -79.9075 },
      'la puntilla': { latitude: -2.2167, longitude: -79.9081 },
      'parque histórico': { latitude: -2.2055, longitude: -79.9230 },
      'ciudadela kennedy': { latitude: -2.1608, longitude: -79.9081 },
      'urdesa': { latitude: -2.1969, longitude: -79.9081 }
    };

    for (const [key, coords] of Object.entries(knownLocations)) {
      if (addressLower.includes(key) || key.includes(addressLower)) {
        console.log(`✅ [REQUEST-TRIP] Ubicación conocida encontrada: ${key}`);
        return {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: 50,
          timestamp: Date.now()
        };
      }
    }

    console.log('📍 [REQUEST-TRIP] Ubicación no conocida, generando cerca del centro');
    
    const guayaquilCenter = { lat: -2.1962, lng: -79.8862 };
    const radiusKm = 10;
    const radiusInDegrees = radiusKm / 111;
    
    const addressHash = this.simpleHash(address);
    const angle = (addressHash % 360) * (Math.PI / 180);
    const distance = ((addressHash % 100) / 100) * radiusInDegrees;
    
    const latitude = guayaquilCenter.lat + (distance * Math.cos(angle));
    const longitude = guayaquilCenter.lng + (distance * Math.sin(angle));
    
    return {
      latitude,
      longitude,
      accuracy: 100,
      timestamp: Date.now()
    };
  }

  /**
   * Genera un hash simple para una cadena
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  // ===== BÚSQUEDA Y SOLICITUD DE VIAJES =====

  /**
   * Busca conductores cercanos usando búsqueda inteligente
   */
  searchNearbyDrivers(): void {
    if (!this.formReadyForSearch) {
      console.warn('⚠️ [REQUEST-TRIP] Formulario no está listo');
      this.markFormGroupTouched();
      return;
    }
    
    this.step = 'searching';
    this.errorMessage = '';
    this.searchResult = null;
    
    this.stopDriverPolling();
    
    const originLat = this.tripForm.value.originLatitude;
    const originLng = this.tripForm.value.originLongitude;
    
    console.log('🔍 [REQUEST-TRIP] Iniciando búsqueda inteligente');
    
    this.driverService.findNearbyDriversIntelligent(originLat, originLng).subscribe({
      next: (result) => {
        this.searchResult = result;
        this.nearbyDrivers = result.drivers;
        this.step = 'drivers';
        
        this.lastDriverIds = result.drivers.map(d => d.id);
        this.driversChangedCount = 0;
        
        console.log('✅ [REQUEST-TRIP] Búsqueda completada:', result);
        console.log(`🎯 [REQUEST-TRIP] Radio usado: ${result.radiusUsed}km`);
        
        if (result.drivers.length > 0) {
          this.calculateDistancesToDrivers(originLat, originLng);
          this.startDriverPolling();
        }
        
        if (result.drivers.length === 0) {
          this.errorMessage = `No hay conductores disponibles en un radio de ${result.radiusUsed}km.`;
        } else {
          this.successMessage = `Se encontraron ${result.drivers.length} conductores en un radio de ${result.radiusUsed}km.`;
          setTimeout(() => this.successMessage = '', 5000);
        }
      },
      error: (error) => {
        console.error('❌ [REQUEST-TRIP] Error en búsqueda:', error);
        this.errorMessage = 'Error al buscar conductores disponibles.';
        this.step = 'form';
      }
    });
  }

  /**
   * Calcula las distancias a los conductores encontrados
   */
  private calculateDistancesToDrivers(originLat: number, originLng: number): void {
    console.log('📏 [REQUEST-TRIP] Calculando distancias a conductores');
    
    const originCoords: LocationCoordinates = { latitude: originLat, longitude: originLng };
    
    this.nearbyDrivers.forEach(driver => {
      if (driver.currentLatitude && driver.currentLongitude) {
        const driverCoords: LocationCoordinates = {
          latitude: driver.currentLatitude,
          longitude: driver.currentLongitude
        };
        
        const distance = this.geolocationService.calculateDistance(originCoords, driverCoords);
        (driver as any).distanceToOrigin = distance;
      }
    });
    
    this.nearbyDrivers.sort((a, b) => {
      const distA = (a as any).distanceToOrigin || 999;
      const distB = (b as any).distanceToOrigin || 999;
      return distA - distB;
    });
    
    console.log('✅ [REQUEST-TRIP] Conductores ordenados por distancia');
  }

  /**
   * Reintenta la búsqueda limpiando el cache
   */
  retrySearch(): void {
    console.log('🔄 [REQUEST-TRIP] Reintentando búsqueda');
    
    this.stopDriverPolling();
    this.driverService.clearDriversCache();
    this.searchNearbyDrivers();
  }

  /**
   * Solicita el viaje con los datos del formulario
   */
  requestTrip(): void {
    if (this.tripForm.valid) {
      this.step = 'requesting';
      this.isLoading = true;
      this.errorMessage = '';
      
      console.log('🛑 [REQUEST-TRIP] Deteniendo polling');
      this.stopDriverPolling();
      
      const formValues = this.tripForm.value;
      
      const originCoords: LocationCoordinates = { 
        latitude: formValues.originLatitude, 
        longitude: formValues.originLongitude 
      };
      const destCoords: LocationCoordinates = { 
        latitude: formValues.destinationLatitude, 
        longitude: formValues.destinationLongitude 
      };
      
      if (!this.geolocationService.isValidCoordinates(originCoords) || 
          !this.geolocationService.isValidCoordinates(destCoords)) {
        this.isLoading = false;
        this.errorMessage = 'Las coordenadas del viaje son inválidas.';
        this.step = 'form';
        return;
      }
      
      const tripDistance = this.geolocationService.calculateDistance(originCoords, destCoords);
      console.log('📏 [REQUEST-TRIP] Distancia del viaje:', tripDistance.toFixed(2), 'km');
      
      if (tripDistance < 0.1) {
        this.isLoading = false;
        this.errorMessage = 'El origen y destino están muy cerca. Mínimo 100 metros.';
        this.step = 'form';
        return;
      }
      
      const tripRequest: TripRequest = {
        originAddress: formValues.originAddress,
        destinationAddress: formValues.destinationAddress,
        originLatitude: formValues.originLatitude,
        originLongitude: formValues.originLongitude,
        destinationLatitude: formValues.destinationLatitude,
        destinationLongitude: formValues.destinationLongitude
      };
      
      console.log('🚖 [REQUEST-TRIP] Solicitando viaje:', tripRequest);
      
      this.tripService.requestTrip(tripRequest).subscribe({
        next: (trip) => {
          this.isLoading = false;
          console.log('✅ [REQUEST-TRIP] Viaje solicitado exitosamente:', trip);
          
          this.successMessage = '¡Viaje solicitado exitosamente! Te hemos asignado un conductor.';
          
          setTimeout(() => {
            this.router.navigate(['/trip-status', trip.id]);
          }, 2000);
        },
        error: (error) => {
          this.isLoading = false;
          console.error('❌ [REQUEST-TRIP] Error solicitando viaje:', error);
          
          if (error.status === 400) {
            this.errorMessage = 'Datos del viaje inválidos. Verifica las direcciones.';
          } else if (error.status === 404) {
            this.errorMessage = 'No hay conductores disponibles en este momento.';
          } else {
            this.errorMessage = 'Error al solicitar el viaje. Intenta nuevamente.';
          }
          
          this.step = 'form';
        }
      });
    } else {
      this.markFormGroupTouched();
    }
  }

  /**
   * Vuelve al formulario principal
   */
  goBackToForm(): void {
    console.log('🔙 [REQUEST-TRIP] Volviendo al formulario');
    
    this.stopDriverPolling();
    
    this.step = 'form';
    this.nearbyDrivers = [];
    this.searchResult = null;
    this.errorMessage = '';
    this.successMessage = '';
    this.lastDriverIds = [];
    this.driversChangedCount = 0;
  }

  /**
   * Navega a la página principal
   */
  goHome(): void {
    this.stopDriverPolling();
    this.router.navigate(['/home']);
  }

  /**
   * Marca todos los campos del formulario como tocados
   */
  private markFormGroupTouched(): void {
    Object.keys(this.tripForm.controls).forEach(key => {
      const control = this.tripForm.get(key);
      control?.markAsTouched();
    });
  }

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

  // ===== GETTERS PARA EL TEMPLATE =====

  /**
   * Verifica si puede iniciar selección de destino
   */
  get canStartDestinationSelection(): boolean {
    return this.hasValidLocation && !this.isSelectingDestination;
  }

  /**
   * Verifica si puede confirmar destino seleccionado
   */
  get canConfirmDestination(): boolean {
    return this.isSelectingDestination && this.lastSelectedLocation !== null;
  }

  /**
   * Verifica si el formulario está listo para búsqueda
   */
  get formReadyForSearch(): boolean {
    return this.tripForm.valid && 
           this.originConfirmed && 
           this.destinationSet &&
           this.hasValidLocation;
  }

  /**
   * Verifica si origen está en modo GPS
   */
  get isOriginGPS(): boolean {
    return this.originMode === 'gps';
  }

  /**
   * Verifica si origen está en modo manual
   */
  get isOriginManual(): boolean {
    return this.originMode === 'manual';
  }

  /**
   * Muestra instrucciones de selección de destino
   */
  get showDestinationInstructions(): boolean {
    return this.isSelectingDestination && this.lastSelectedLocation === null;
  }

  /**
   * Muestra confirmación de destino
   */
  get showDestinationConfirmation(): boolean {
    return this.isSelectingDestination && this.lastSelectedLocation !== null;
  }

  // ===== MÉTODOS DE INFORMACIÓN =====

  /**
   * Obtiene información de la ubicación actual
   */
  getLocationInfo(): string {
    if (!this.userLocation) return 'Sin ubicación';
    
    const accuracy = this.userLocation.accuracy ? `±${Math.round(this.userLocation.accuracy)}m` : '';
    const coords = `${this.userLocation.latitude.toFixed(6)}, ${this.userLocation.longitude.toFixed(6)}`;
    
    return `${coords} ${accuracy}`;
  }

  /**
   * Verifica si la ubicación está en Ecuador
   */
  isLocationInEcuador(): boolean {
    if (!this.userLocation) return false;
    return this.geolocationService.isInEcuador(this.userLocation);
  }

  /**
   * Obtiene la edad de la ubicación
   */
  getLocationAge(): string {
    if (!this.locationObtainedTime) return '';
    
    const ageMs = Date.now() - this.locationObtainedTime.getTime();
    const ageMinutes = Math.round(ageMs / 60000);
    
    if (ageMinutes < 1) return 'Ahora';
    if (ageMinutes === 1) return 'Hace 1 minuto';
    return `Hace ${ageMinutes} minutos`;
  }

  /**
   * Formatea una distancia en metros o kilómetros
   */
  formatDistance(distance: number): string {
    if (distance < 1) {
      return `${Math.round(distance * 1000)}m`;
    }
    return `${distance.toFixed(1)}km`;
  }

  /**
   * Obtiene la distancia de un conductor
   */
  getDriverDistance(driver: Driver): string {
    const distance = (driver as any).distanceToOrigin;
    if (distance !== undefined) {
      return this.formatDistance(distance);
    }
    return '';
  }

  /**
   * Obtiene el nombre completo de un conductor
   */
  getDriverFullName(driver: Driver): string {
    return `${driver.firstName} ${driver.lastName}`.trim();
  }

  /**
   * Obtiene información de la búsqueda
   */
  getSearchInfo(): string {
    if (!this.searchResult) return '';
    
    return `Radio: ${this.searchResult.radiusUsed}km | ` +
           `Tiempo: ${Math.round(this.searchResult.searchTime / 1000)}s | ` +
           `Intentos: ${this.searchResult.totalAttempts}`;
  }

  /**
   * Obtiene mensaje de estado de búsqueda
   */
  getSearchStatusMessage(): string {
    if (!this.searchResult) return '';
    
    const { radiusUsed, totalAttempts, drivers } = this.searchResult;
    
    if (drivers.length === 0) {
      return `Sin conductores en ${radiusUsed}km después de ${totalAttempts} intentos`;
    }
    
    let phase = '';
    if (radiusUsed <= 5) phase = '(Centro urbano)';
    else if (radiusUsed <= 12) phase = '(Zona metropolitana)';
    else phase = '(Área extendida)';
    
    return `${drivers.length} conductores encontrados en ${radiusUsed}km ${phase}`;
  }

  /**
   * Actualización manual de conductores
   */
  manualRefresh(): void {
    if (this.step !== 'drivers') return;
    
    console.log('🔄 [REQUEST-TRIP] Actualización manual solicitada');
    
    this.isPollingDrivers = true;
    this.updateDriversList();
  }

  // ===== GETTERS ADICIONALES =====
  
  get originAddress() { return this.tripForm.get('originAddress'); }
  get destinationAddress() { return this.tripForm.get('destinationAddress'); }
  
  get hasValidLocation(): boolean {
    return this.userLocation !== null && this.geolocationService.isValidCoordinates(this.userLocation);
  }
  
  get locationStatusText(): string {
    if (this.isLoadingLocation) return 'Obteniendo ubicación...';
    if (!this.userLocation) return 'Sin ubicación';
    if (!this.isLocationInEcuador()) return 'Ubicación fuera de Ecuador';
    return `Ubicación GPS obtenida ${this.getLocationAge()}`;
  }

  get isUsingGPSOrigin(): boolean {
    return this.originMode === 'gps' && this.hasValidLocation;
  }

  get canRefreshLocation(): boolean {
    return !this.isLoadingLocation;
  }

  get hasSearchResult(): boolean {
    return this.searchResult !== null;
  }

  get driversFound(): number {
    return this.nearbyDrivers.length;
  }

  get lastSearchRadius(): number {
    return this.searchResult?.radiusUsed || 0;
  }

  get pollingActive(): boolean {
    return this.isPollingActive;
  }

  get isUpdatingDrivers(): boolean {
    return this.isPollingDrivers;
  }

  get totalChangesDetected(): number {
    return this.driversChangedCount;
  }

  /**
   * Debug del estado del componente
   */
  debugLocationState(): void {
    console.log('\n🚖 ===== REQUEST-TRIP DEBUG =====');
    console.log('Estado del componente:');
    console.log('  - Usuario ubicación:', this.userLocation);
    console.log('  - Ubicación obtenida:', this.locationObtainedTime);
    console.log('  - Modo origen:', this.originMode);
    console.log('  - Origen confirmado:', this.originConfirmed);
    console.log('  - Destino establecido:', this.destinationSet);
    console.log('  - Seleccionando destino:', this.isSelectingDestination);
    console.log('  - Formulario listo:', this.formReadyForSearch);
    console.log('  - Step actual:', this.step);
    console.log('  - Conductores encontrados:', this.driversFound);
    console.log('  - Polling activo:', this.isPollingActive);
    console.log('  - Valores formulario:', this.tripForm.value);
    console.log('🚖 ===== END DEBUG =====\n');
  }
}
