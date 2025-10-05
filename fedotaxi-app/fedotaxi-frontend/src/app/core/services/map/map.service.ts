import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { LocationCoordinates } from '../geolocation/geolocation.service';

export interface MapConfig {
  containerId: string;
  center?: [number, number];
  zoom?: number;
  zoomControl?: boolean;
}

export interface MarkerConfig {
  coordinates: [number, number];
  title?: string;
  icon?: L.Icon;
  popup?: string;
  draggable?: boolean;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  label?: string;
}

@Injectable({
  providedIn: 'root'
})
export class MapService {
  
  private maps = new Map<string, L.Map>();
  private markers = new Map<string, Map<string, L.Marker>>();
  private polylines = new Map<string, Map<string, L.Polyline>>();
  
  // Iconos personalizados SVG embebidos
  private readonly icons = {
    user: L.icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMyNTYzZWIiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSJ3aGl0ZSI+CiAgPGNpcmNsZSBjeD0iNCIgY3k9IjQiIHI9IjMiLz4KPC9zdmc+Cjwvc3ZnPg==',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15]
    }),
    
    driver: L.icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMxMGI5ODEiLz4KPHN2ZyB4PSI2IiB5PSI4IiB3aWR0aD0iMTIiIGhlaWdodD0iOCIgZmlsbD0id2hpdGUiPgogIDxyZWN0IHdpZHRoPSIxMiIgaGVpZ2h0PSI0IiByeD0iMSIvPgogIDxyZWN0IHk9IjUiIHdpZHRoPSIzIiBoZWlnaHQ9IjMiIHJ4PSIwLjUiLz4KICA8cmVjdCB4PSI5IiB5PSI1IiB3aWR0aD0iMyIgaGVpZ2h0PSIzIiByeD0iMC41Ii8+Cjwvc3ZnPgo8L3N2Zz4=',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15]
    }),
    
    origin: L.icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiMxMGI5ODEiLz4KPGF0aCBkPSJNMTIgOGE0IDQgMCAxIDEgMCA4IDQgNCAwIDAgMSAwLTh6IiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4=',
      iconSize: [25, 25],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    }),
    
    destination: L.icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiIGZpbGw9IiNlZjQ0NDQiLz4KPHN2ZyB4PSI4IiB5PSI4IiB3aWR0aD0iOCIgaGVpZ2h0PSI4IiBmaWxsPSJ3aGl0ZSI+CiAgPHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIvPgo8L3N2Zz4KPC9zdmc+',
      iconSize: [25, 25],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    })
  };

  constructor() {
    console.log('🗺️ MapService inicializado');
    this.fixLeafletIconIssue();
  }

  /**
   * Crear un nuevo mapa de Leaflet
   */
  createMap(config: MapConfig): L.Map {
    console.log(`🗺️ Creando mapa: ${config.containerId}`);

    // Verificar contenedor
    const container = document.getElementById(config.containerId);
    if (!container) {
      throw new Error(`Contenedor de mapa no encontrado: ${config.containerId}`);
    }

    // Limpiar mapa existente si existe
    if (this.maps.has(config.containerId)) {
      this.destroyMap(config.containerId);
    }

    // Configuración por defecto (centro de Guayaquil)
    const defaultCenter: [number, number] = [-2.1962, -79.8862];
    const center = config.center || defaultCenter;
    const zoom = config.zoom || 13;

    // Crear mapa
    const map = L.map(config.containerId, {
      zoomControl: config.zoomControl !== false
    }).setView(center, zoom);

    // Agregar capa de OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
      minZoom: 3
    }).addTo(map);

    // Guardar referencias
    this.maps.set(config.containerId, map);
    this.markers.set(config.containerId, new Map());
    this.polylines.set(config.containerId, new Map());

    console.log(`✅ Mapa creado: ${config.containerId}`);
    return map;
  }

  /**
   * Obtener mapa existente por ID
   */
  getMap(containerId: string): L.Map | undefined {
    return this.maps.get(containerId);
  }

  /**
   * Agregar marcador al mapa
   */
  addMarker(mapId: string, markerId: string, config: MarkerConfig): L.Marker | null {
    const map = this.maps.get(mapId);
    if (!map) {
      console.error(`❌ Mapa no encontrado: ${mapId}`);
      return null;
    }

    // Crear marcador
    const marker = L.marker(config.coordinates, {
      icon: config.icon || this.icons.user,
      title: config.title,
      draggable: config.draggable || false
    }).addTo(map);

    // Agregar popup si se especifica
    if (config.popup) {
      marker.bindPopup(config.popup);
    }

    // Guardar referencia
    const mapMarkers = this.markers.get(mapId)!;
    
    // Remover marcador existente si existe
    if (mapMarkers.has(markerId)) {
      mapMarkers.get(markerId)!.remove();
    }
    
    mapMarkers.set(markerId, marker);

    console.log(`📍 Marcador agregado: ${markerId} en ${mapId}`);
    return marker;
  }

  /**
   * Mover marcador existente a nuevas coordenadas
   */
  moveMarker(mapId: string, markerId: string, newCoordinates: [number, number]): boolean {
    const mapMarkers = this.markers.get(mapId);
    if (!mapMarkers || !mapMarkers.has(markerId)) {
      console.warn(`⚠️ Marcador no encontrado: ${markerId} en ${mapId}`);
      return false;
    }

    const marker = mapMarkers.get(markerId)!;
    marker.setLatLng(newCoordinates);

    console.log(`🔄 Marcador movido: ${markerId}`);
    return true;
  }

  /**
   * Remover marcador del mapa
   */
  removeMarker(mapId: string, markerId: string): boolean {
    const mapMarkers = this.markers.get(mapId);
    if (!mapMarkers || !mapMarkers.has(markerId)) {
      return false;
    }

    const marker = mapMarkers.get(markerId)!;
    marker.remove();
    mapMarkers.delete(markerId);

    console.log(`🗑️ Marcador removido: ${markerId}`);
    return true;
  }

  /**
   * Dibujar ruta entre múltiples puntos
   */
  drawRoute(mapId: string, routeId: string, points: RoutePoint[], color: string = '#3388ff'): L.Polyline | null {
    const map = this.maps.get(mapId);
    if (!map) {
      console.error(`❌ Mapa no encontrado: ${mapId}`);
      return null;
    }

    // Convertir puntos a formato Leaflet
    const latLngs: [number, number][] = points.map(p => [p.lat, p.lng]);

    // Crear polyline
    const polyline = L.polyline(latLngs, {
      color: color,
      weight: 5,
      opacity: 0.8
    }).addTo(map);

    // Guardar referencia
    const mapPolylines = this.polylines.get(mapId)!;
    
    // Remover ruta existente si existe
    if (mapPolylines.has(routeId)) {
      mapPolylines.get(routeId)!.remove();
    }
    
    mapPolylines.set(routeId, polyline);

    console.log(`🛣️ Ruta dibujada: ${routeId} con ${points.length} puntos`);
    return polyline;
  }

  /**
   * Centrar mapa en coordenadas específicas
   */
  centerMap(mapId: string, coordinates: [number, number], zoom?: number): boolean {
    const map = this.maps.get(mapId);
    if (!map) {
      console.error(`❌ Mapa no encontrado: ${mapId}`);
      return false;
    }

    if (zoom !== undefined) {
      map.setView(coordinates, zoom);
    } else {
      map.panTo(coordinates);
    }

    console.log(`🎯 Mapa centrado: ${mapId}`);
    return true;
  }

  /**
   * Ajustar vista para mostrar todos los marcadores
   */
  fitToMarkers(mapId: string, padding: number = 50): boolean {
    const map = this.maps.get(mapId);
    const mapMarkers = this.markers.get(mapId);
    
    if (!map || !mapMarkers || mapMarkers.size === 0) {
      console.warn(`⚠️ No se puede ajustar vista: ${mapId}`);
      return false;
    }

    // Crear grupo de marcadores
    const group = new L.FeatureGroup(Array.from(mapMarkers.values()));
    
    // Ajustar vista
    map.fitBounds(group.getBounds(), { padding: [padding, padding] });

    console.log(`📐 Vista ajustada a ${mapMarkers.size} marcadores`);
    return true;
  }

  /**
   * Agregar marcador de ubicación del usuario
   */
  addUserMarker(mapId: string, coordinates: LocationCoordinates, title: string = 'Tu ubicación'): L.Marker | null {
    return this.addMarker(mapId, 'user', {
      coordinates: [coordinates.latitude, coordinates.longitude],
      icon: this.icons.user,
      title: title,
      popup: `${title}<br>Lat: ${coordinates.latitude.toFixed(6)}<br>Lng: ${coordinates.longitude.toFixed(6)}`
    });
  }

  /**
   * Agregar marcador de conductor
   */
  addDriverMarker(mapId: string, driverId: string, coordinates: LocationCoordinates, driverName: string): L.Marker | null {
    return this.addMarker(mapId, `driver-${driverId}`, {
      coordinates: [coordinates.latitude, coordinates.longitude],
      icon: this.icons.driver,
      title: `Conductor: ${driverName}`,
      popup: `Conductor: ${driverName}<br>Lat: ${coordinates.latitude.toFixed(6)}<br>Lng: ${coordinates.longitude.toFixed(6)}`
    });
  }

  /**
   * Agregar marcadores de origen y destino para un viaje
   */
  addTripMarkers(mapId: string, origin: LocationCoordinates, destination: LocationCoordinates, 
                 originAddress: string, destinationAddress: string): { origin: L.Marker | null, destination: L.Marker | null } {
    
    const originMarker = this.addMarker(mapId, 'trip-origin', {
      coordinates: [origin.latitude, origin.longitude],
      icon: this.icons.origin,
      title: 'Origen',
      popup: `Origen: ${originAddress}`
    });

    const destinationMarker = this.addMarker(mapId, 'trip-destination', {
      coordinates: [destination.latitude, destination.longitude],
      icon: this.icons.destination,
      title: 'Destino',
      popup: `Destino: ${destinationAddress}`
    });

    return { origin: originMarker, destination: destinationMarker };
  }

  /**
   * Dibujar ruta simple entre origen y destino
   */
  drawTripRoute(mapId: string, origin: LocationCoordinates, destination: LocationCoordinates): L.Polyline | null {
    const points: RoutePoint[] = [
      { lat: origin.latitude, lng: origin.longitude, label: 'Origen' },
      { lat: destination.latitude, lng: destination.longitude, label: 'Destino' }
    ];

    return this.drawRoute(mapId, 'trip-route', points, '#3b82f6');
  }

  /**
   * Configurar mapa para solicitud de viaje
   */
  setupTripRequestMap(mapId: string, userLocation?: LocationCoordinates): void {
    console.log('🚖 Configurando mapa para solicitud de viaje');
    
    const map = this.getMap(mapId);
    if (!map) {
      console.error(`❌ Mapa no encontrado: ${mapId}`);
      return;
    }

    // Limpiar marcadores existentes
    this.clearMarkers(mapId);

    // Agregar marcador de usuario si tenemos ubicación
    if (userLocation) {
      this.addUserMarker(mapId, userLocation);
      this.centerMap(mapId, [userLocation.latitude, userLocation.longitude], 15);
    }

    console.log('✅ Mapa configurado para solicitud de viaje');
  }

  /**
   * Configurar mapa para tracking de viaje activo
   */
  setupTripTrackingMap(mapId: string, origin: LocationCoordinates, destination: LocationCoordinates,
                      originAddress: string, destinationAddress: string, userLocation?: LocationCoordinates): void {
    console.log('🎯 Configurando mapa para tracking de viaje');
    
    const map = this.getMap(mapId);
    if (!map) {
      console.error(`❌ Mapa no encontrado: ${mapId}`);
      return;
    }

    // Limpiar mapa
    this.clearMarkers(mapId);
    this.clearRoutes(mapId);

    // Agregar marcadores del viaje
    this.addTripMarkers(mapId, origin, destination, originAddress, destinationAddress);

    // Dibujar ruta
    this.drawTripRoute(mapId, origin, destination);

    // Agregar marcador de usuario si tenemos ubicación
    if (userLocation) {
      this.addUserMarker(mapId, userLocation);
    }

    // Ajustar vista para mostrar todos los puntos
    this.fitToMarkers(mapId, 100);

    console.log('✅ Mapa configurado para tracking de viaje');
  }

  /**
   * Limpiar todos los marcadores del mapa
   */
  clearMarkers(mapId: string): void {
    const mapMarkers = this.markers.get(mapId);
    if (mapMarkers) {
      mapMarkers.forEach(marker => marker.remove());
      mapMarkers.clear();
      console.log(`🧹 Marcadores limpiados: ${mapId}`);
    }
  }

  /**
   * Limpiar todas las rutas del mapa
   */
  clearRoutes(mapId: string): void {
    const mapPolylines = this.polylines.get(mapId);
    if (mapPolylines) {
      mapPolylines.forEach(polyline => polyline.remove());
      mapPolylines.clear();
      console.log(`🧹 Rutas limpiadas: ${mapId}`);
    }
  }

  /**
   * Destruir mapa completamente y liberar recursos
   */
  destroyMap(mapId: string): void {
    const map = this.maps.get(mapId);
    if (map) {
      // Limpiar marcadores y rutas
      this.clearMarkers(mapId);
      this.clearRoutes(mapId);
      
      // Remover mapa
      map.remove();
      
      // Limpiar referencias
      this.maps.delete(mapId);
      this.markers.delete(mapId);
      this.polylines.delete(mapId);
      
      console.log(`🗑️ Mapa destruido: ${mapId}`);
    }
  }

  /**
   * Obtener iconos disponibles
   */
  getIcons() {
    return this.icons;
  }

  /**
   * Crear icono personalizado
   */
  createIcon(iconUrl: string, size: [number, number] = [30, 30]): L.Icon {
    return L.icon({
      iconUrl: iconUrl,
      iconSize: size,
      iconAnchor: [size[0] / 2, size[1] / 2],
      popupAnchor: [0, -size[1] / 2]
    });
  }

  /**
   * Verificar si un mapa existe
   */
  hasMap(mapId: string): boolean {
    return this.maps.has(mapId);
  }

  /**
   * Obtener estadísticas de todos los mapas
   */
  getMapStats(): { mapsCount: number, totalMarkers: number, totalRoutes: number } {
    let totalMarkers = 0;
    let totalRoutes = 0;

    this.markers.forEach(mapMarkers => {
      totalMarkers += mapMarkers.size;
    });

    this.polylines.forEach(mapPolylines => {
      totalRoutes += mapPolylines.size;
    });

    return {
      mapsCount: this.maps.size,
      totalMarkers,
      totalRoutes
    };
  }

  /**
   * Convertir LocationCoordinates a formato Leaflet
   */
  locationToLatLng(location: LocationCoordinates): [number, number] {
    return [location.latitude, location.longitude];
  }

  /**
   * Debug completo del estado del servicio
   */
  debugInfo(): void {
    console.log('\n🗺️ === MAP SERVICE DEBUG ===');
    console.log(`Mapas activos: ${this.maps.size}`);
    
    this.maps.forEach((map, mapId) => {
      const markersCount = this.markers.get(mapId)?.size || 0;
      const routesCount = this.polylines.get(mapId)?.size || 0;
      console.log(`  ${mapId}: ${markersCount} marcadores, ${routesCount} rutas`);
    });
    
    const stats = this.getMapStats();
    console.log('Estadísticas totales:', stats);
    console.log('🗺️ === END DEBUG ===\n');
  }

  /**
   * Fix para iconos de Leaflet en entornos Angular
   */
  private fixLeafletIconIssue(): void {
    // Solución conocida para iconos de Leaflet en Angular
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
    });
  }
}
