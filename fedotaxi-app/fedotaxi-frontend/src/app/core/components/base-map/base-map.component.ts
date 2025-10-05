import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { LocationCoordinates } from '../../services/geolocation/geolocation.service';
import { MapService } from '../../services/map/map.service';

export interface MapClickEvent {
  coordinates: [number, number];
  address?: string;
}

export interface SelectedLocation {
  lat: number;
  lng: number;
  address?: string;
}

@Component({
  selector: 'app-base-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './base-map.component.html',
  styleUrls: ['./base-map.component.scss']
})
export class BaseMapComponent implements OnInit, AfterViewInit, OnDestroy {
  
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  
  // Configuración del mapa
  @Input() mapId: string = 'default-map';
  @Input() height: number = 400;
  @Input() center: [number, number] = [-2.1962, -79.8862]; // Guayaquil por defecto
  @Input() zoom: number = 13;
  @Input() minZoom: number = 3;
  @Input() maxZoom: number = 18;
  @Input() loading: boolean = false;
  @Input() loadingMessage: string = 'Cargando mapa...';
  
  // Controles y UI
  @Input() showControls: boolean = true;
  @Input() showMyLocationButton: boolean = true;
  @Input() showFullscreenButton: boolean = false;
  @Input() showRefreshButton: boolean = false;
  @Input() showInfoPanel: boolean = false;
  @Input() showStatusBar: boolean = false;
  @Input() showSelectionActions: boolean = false;
  @Input() clickable: boolean = false;
  
  // Datos de ubicación
  @Input() userLocation: LocationCoordinates | null = null;
  @Input() enableGeolocation: boolean = true;
  
  // Eventos del componente
  @Output() mapReady = new EventEmitter<L.Map>();
  @Output() mapClick = new EventEmitter<MapClickEvent>();
  @Output() locationSelected = new EventEmitter<LocationCoordinates>();
  @Output() myLocationRequested = new EventEmitter<void>();
  @Output() selectionConfirmed = new EventEmitter<SelectedLocation>();
  @Output() mapRefreshed = new EventEmitter<void>();
  
  // Estado interno
  map: L.Map | null = null;
  selectedLocation: SelectedLocation | null = null;
  isFullscreen: boolean = false;
  private isInitialized: boolean = false;
  
  constructor(private mapService: MapService) {}
  
  ngOnInit() {
    console.log(`🗺️ Inicializando mapa: ${this.mapId}`);
  }
  
  ngAfterViewInit() {
    // Delay para asegurar que el DOM esté listo
    setTimeout(() => {
      this.initializeMap();
    }, 100);
  }
  
  ngOnDestroy() {
    console.log(`🗑️ Destruyendo mapa: ${this.mapId}`);
    if (this.map && this.isInitialized) {
      this.mapService.destroyMap(this.mapId);
      this.isInitialized = false;
    }
  }
  
  /**
   * Inicializar el mapa de Leaflet
   */
  private initializeMap(): void {
    try {
      console.log(`🗺️ Creando mapa: ${this.mapId}`);
      
      const container = document.getElementById(this.mapId);
      if (!container) {
        console.error(`❌ Contenedor no encontrado: ${this.mapId}`);
        return;
      }
      
      this.map = this.mapService.createMap({
        containerId: this.mapId,
        center: this.center,
        zoom: this.zoom,
        zoomControl: false // Usar controles personalizados
      });
      
      // Configurar límites de zoom
      this.map.setMinZoom(this.minZoom);
      this.map.setMaxZoom(this.maxZoom);
      
      this.setupMapEvents();
      
      // Agregar marcador de usuario si existe
      if (this.userLocation) {
        this.updateUserLocation(this.userLocation);
      }
      
      this.isInitialized = true;
      this.mapReady.emit(this.map);
      console.log('✅ Mapa inicializado exitosamente');
      
    } catch (error) {
      console.error('❌ Error inicializando mapa:', error);
      this.loading = false;
    }
  }
  
  /**
   * Configurar eventos del mapa
   */
  private setupMapEvents(): void {
    if (!this.map) return;
    
    // Eventos de click
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      
      console.log(`🖱️ Click en mapa: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      
      if (this.clickable) {
        this.selectedLocation = { lat, lng };
        
        // Agregar marcador temporal
        this.addTemporaryMarker(lat, lng);
        
        // Emitir eventos
        this.mapClick.emit({ coordinates: [lat, lng] });
        this.locationSelected.emit({ latitude: lat, longitude: lng });
      }
    });
    
    // Eventos de zoom
    this.map.on('zoomend', () => {
      console.log(`🔍 Zoom: ${this.map?.getZoom()}`);
    });
    
    // Eventos de carga
    this.map.on('load', () => {
      console.log('✅ Mapa completamente cargado');
      this.loading = false;
    });
  }
  
  /**
   * Agregar marcador temporal en ubicación seleccionada
   */
  private addTemporaryMarker(lat: number, lng: number): void {
    if (!this.map) return;
    
    // Remover marcador temporal anterior
    this.mapService.removeMarker(this.mapId, 'temp-selection');
    
    // Agregar nuevo marcador temporal
    this.mapService.addMarker(this.mapId, 'temp-selection', {
      coordinates: [lat, lng],
      title: 'Ubicación seleccionada',
      popup: `Lat: ${lat.toFixed(6)}<br>Lng: ${lng.toFixed(6)}`,
      icon: this.mapService.getIcons().origin
    });
  }
  
  /**
   * Actualizar ubicación del usuario en el mapa
   */
  updateUserLocation(location: LocationCoordinates): void {
    if (!this.map || !this.isInitialized) return;
    
    console.log(`📍 Actualizando ubicación: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`);
    
    this.userLocation = location;
    this.mapService.addUserMarker(this.mapId, location);
  }
  
  /**
   * Centrar mapa en ubicación del usuario
   */
  centerOnMyLocation(): void {
    if (this.userLocation && this.map) {
      console.log('🎯 Centrando en ubicación de usuario');
      this.mapService.centerMap(this.mapId, [this.userLocation.latitude, this.userLocation.longitude], 16);
    } else if (this.enableGeolocation) {
      console.log('📍 Solicitando ubicación de usuario');
      this.myLocationRequested.emit();
    }
  }
  
  /**
   * Aumentar zoom del mapa
   */
  zoomIn(): void {
    if (this.map) {
      this.map.zoomIn();
      console.log(`🔍 Zoom in: ${this.map.getZoom()}`);
    }
  }
  
  /**
   * Disminuir zoom del mapa
   */
  zoomOut(): void {
    if (this.map) {
      this.map.zoomOut();
      console.log(`🔍 Zoom out: ${this.map.getZoom()}`);
    }
  }
  
  /**
   * Alternar modo pantalla completa
   */
  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    
    const container = this.mapContainer.nativeElement.parentElement;
    
    if (this.isFullscreen) {
      console.log('📺 Activando pantalla completa');
      container?.classList.add('map-fullscreen');
      this.height = window.innerHeight;
    } else {
      console.log('📺 Desactivando pantalla completa');
      container?.classList.remove('map-fullscreen');
      this.height = 400;
    }
    
    // Invalidar tamaño del mapa
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 100);
  }
  
  /**
   * Refrescar el mapa
   */
  refreshMap(): void {
    console.log('🔄 Refrescando mapa');
    
    if (this.map) {
      this.map.invalidateSize();
      
      // Refrescar marcador de usuario si existe
      if (this.userLocation) {
        this.updateUserLocation(this.userLocation);
      }
    }
    
    this.mapRefreshed.emit();
  }
  
  /**
   * Confirmar selección de ubicación
   */
  confirmSelection(): void {
    if (this.selectedLocation) {
      console.log(`✅ Confirmando selección: ${this.selectedLocation.lat}, ${this.selectedLocation.lng}`);
      this.selectionConfirmed.emit(this.selectedLocation);
    }
  }
  
  /**
   * Limpiar selección actual
   */
  clearSelection(): void {
    console.log('🧹 Limpiando selección');
    this.selectedLocation = null;
    
    // Remover marcador temporal
    this.mapService.removeMarker(this.mapId, 'temp-selection');
  }
  
  // ===== MÉTODOS PÚBLICOS PARA CONTROL EXTERNO =====
  
  public addMarker(id: string, coordinates: LocationCoordinates, title?: string, popup?: string): void {
    this.mapService.addMarker(this.mapId, id, {
      coordinates: [coordinates.latitude, coordinates.longitude],
      title: title,
      popup: popup || title
    });
  }
  
  public removeMarker(id: string): void {
    this.mapService.removeMarker(this.mapId, id);
  }
  
  public centerMap(coordinates: LocationCoordinates, zoom?: number): void {
    this.mapService.centerMap(this.mapId, [coordinates.latitude, coordinates.longitude], zoom);
  }
  
  public fitToMarkers(padding: number = 50): void {
    this.mapService.fitToMarkers(this.mapId, padding);
  }
  
  public clearMarkers(): void {
    this.mapService.clearMarkers(this.mapId);
  }
  
  public clearRoutes(): void {
    this.mapService.clearRoutes(this.mapId);
  }
  
  public getMap(): L.Map | null {
    return this.map;
  }
  
  public isMapReady(): boolean {
    return this.isInitialized && this.map !== null;
  }
  
  // ===== MÉTODOS PARA EL TEMPLATE =====
  
  getMapStatusText(): string {
    if (!this.map) return 'Inicializando...';
    if (this.loading) return 'Cargando...';
    return 'Mapa listo';
  }
  
  getGPSAccuracy(): string {
    if (!this.userLocation) return 'Sin GPS';
    
    const accuracy = this.userLocation.accuracy || 0;
    if (accuracy <= 10) return 'Excelente';
    if (accuracy <= 50) return 'Buena';
    if (accuracy <= 100) return 'Regular';
    return 'Baja';
  }
  
  getCurrentZoom(): number {
    return this.map?.getZoom() || this.zoom;
  }
  
  getLocationInfo(): string {
    if (!this.userLocation) return 'Sin ubicación';
    
    const coords = `${this.userLocation.latitude.toFixed(6)}, ${this.userLocation.longitude.toFixed(6)}`;
    const accuracy = this.userLocation.accuracy ? ` (±${Math.round(this.userLocation.accuracy)}m)` : '';
    
    return coords + accuracy;
  }
  
  // ===== GETTERS PARA EL TEMPLATE =====
  
  get hasUserLocation(): boolean {
    return this.userLocation !== null;
  }
  
  get isMapLoaded(): boolean {
    return this.isInitialized && !this.loading;
  }
  
  get canZoomIn(): boolean {
    return this.map ? this.map.getZoom() < this.maxZoom : true;
  }
  
  get canZoomOut(): boolean {
    return this.map ? this.map.getZoom() > this.minZoom : true;
  }
}
