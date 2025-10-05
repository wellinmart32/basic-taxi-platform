import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, timeout } from 'rxjs/operators';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface GeolocationError {
  code: number;
  message: string;
  userMessage: string;
}

export interface LocationMode {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}

@Injectable({
  providedIn: 'root'
})
export class GeolocationService {

  // Configuraciones para diferentes modos de uso
  private readonly staticMode: LocationMode = {
    enableHighAccuracy: true,    // GPS real para precisión
    timeout: 15000,              // 15 segundos para obtener GPS
    maximumAge: 300000           // Cache 5 minutos (modo estático)
  };

  private readonly dynamicMode: LocationMode = {
    enableHighAccuracy: true,    // GPS real para tracking
    timeout: 10000,              // 10 segundos (más rápido)
    maximumAge: 5000             // Cache 5 segundos (modo dinámico)
  };

  // Cache de ubicaciones por modo
  private staticLocation: LocationCoordinates | null = null;
  private staticLocationTime: number = 0;
  private dynamicLocation: LocationCoordinates | null = null;
  private dynamicLocationTime: number = 0;

  // Estado del servicio
  private isInDynamicMode = false;

  constructor() {
    console.log('🌍 GeolocationService inicializado');
  }

  /**
   * Obtener ubicación estática (para solicitudes de viaje)
   */
  getStaticLocation(): Observable<LocationCoordinates> {
    console.log('📍 Solicitando ubicación estática');

    // Verificar cache estático
    if (this.hasValidStaticCache()) {
      console.log('⚡ Usando ubicación estática desde cache');
      return new Observable(observer => {
        observer.next(this.staticLocation!);
        observer.complete();
      });
    }

    // Obtener nueva ubicación estática
    return this.getCurrentLocation(this.staticMode).pipe(
      map((coordinates) => {
        // Guardar en cache estático
        this.staticLocation = coordinates;
        this.staticLocationTime = Date.now();
        console.log('💾 Ubicación estática guardada en cache (5 minutos)');
        return coordinates;
      })
    );
  }

  /**
   * Obtener ubicación dinámica (para tracking de viajes activos)
   */
  getDynamicLocation(): Observable<LocationCoordinates> {
    console.log('🎯 Solicitando ubicación dinámica');

    // Verificar cache dinámico
    if (this.hasValidDynamicCache()) {
      console.log('⚡ Usando ubicación dinámica desde cache');
      return new Observable(observer => {
        observer.next(this.dynamicLocation!);
        observer.complete();
      });
    }

    // Obtener nueva ubicación dinámica
    return this.getCurrentLocation(this.dynamicMode).pipe(
      map((coordinates) => {
        // Guardar en cache dinámico
        this.dynamicLocation = coordinates;
        this.dynamicLocationTime = Date.now();
        console.log('💾 Ubicación dinámica guardada en cache (5 segundos)');
        return coordinates;
      })
    );
  }

  /**
   * Forzar obtención de GPS fresco (sin cache)
   */
  getFreshLocation(mode: 'static' | 'dynamic' = 'static'): Observable<LocationCoordinates> {
    console.log(`🔄 Forzando GPS fresco (modo: ${mode})`);
    
    const locationMode = mode === 'static' ? this.staticMode : this.dynamicMode;
    
    return this.getCurrentLocation(locationMode).pipe(
      map((coordinates) => {
        // Actualizar cache correspondiente
        if (mode === 'static') {
          this.staticLocation = coordinates;
          this.staticLocationTime = Date.now();
        } else {
          this.dynamicLocation = coordinates;
          this.dynamicLocationTime = Date.now();
        }
        console.log(`✅ GPS fresco obtenido y cache ${mode} actualizado`);
        return coordinates;
      })
    );
  }

  /**
   * Activar modo dinámico para tracking de viaje
   */
  enableDynamicMode(): void {
    console.log('🚀 Activando modo dinámico para tracking');
    this.isInDynamicMode = true;
  }

  /**
   * Desactivar modo dinámico (volver a modo estático)
   */
  disableDynamicMode(): void {
    console.log('🛑 Desactivando modo dinámico');
    this.isInDynamicMode = false;
    // Limpiar cache dinámico
    this.dynamicLocation = null;
    this.dynamicLocationTime = 0;
  }

  /**
   * Obtener ubicación basada en el modo activo
   */
  getCurrentActiveLocation(): Observable<LocationCoordinates> {
    return this.isInDynamicMode ? this.getDynamicLocation() : this.getStaticLocation();
  }

  /**
   * Obtener ubicación actual con opciones personalizadas
   */
  getCurrentLocation(options?: PositionOptions): Observable<LocationCoordinates> {
    console.log('📍 Solicitando ubicación actual');

    // Verificar disponibilidad de geolocalización
    if (!navigator.geolocation) {
      console.error('❌ Geolocalización no soportada');
      return throwError(() => this.createError(
        0, 
        'Geolocation not supported', 
        'Tu navegador no soporta geolocalización'
      ));
    }

    // Usar opciones personalizadas o las estáticas por defecto
    const finalOptions = options || this.staticMode;
    console.log('⚙️ Opciones GPS:', finalOptions);

    // Crear Observable desde getCurrentPosition
    return from(new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log('✅ Ubicación obtenida exitosamente');
          resolve(position);
        },
        (error) => {
          console.error('❌ Error obteniendo ubicación:', error);
          reject(error);
        },
        finalOptions
      );
    })).pipe(
      // Timeout adicional por seguridad
      timeout(finalOptions.timeout! + 2000),
      
      // Mapear a formato estándar
      map((position: GeolocationPosition) => {
        const coordinates: LocationCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };

        console.log(`📍 Coordenadas: ${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`);
        
        // Validar coordenadas
        if (!this.isValidCoordinates(coordinates)) {
          throw new Error('Coordenadas inválidas recibidas');
        }
        
        return coordinates;
      }),
      
      // Manejo de errores
      catchError((error) => {
        console.error('💥 Error en obtención de ubicación:', error);
        return throwError(() => this.handleGeolocationError(error));
      })
    );
  }

  /**
   * Limpiar cache de ubicaciones
   */
  clearCache(mode: 'static' | 'dynamic' | 'all' = 'all'): void {
    switch (mode) {
      case 'static':
        console.log('🧹 Limpiando cache estático');
        this.staticLocation = null;
        this.staticLocationTime = 0;
        break;
      case 'dynamic':
        console.log('🧹 Limpiando cache dinámico');
        this.dynamicLocation = null;
        this.dynamicLocationTime = 0;
        break;
      case 'all':
      default:
        console.log('🧹 Limpiando todos los caches');
        this.staticLocation = null;
        this.staticLocationTime = 0;
        this.dynamicLocation = null;
        this.dynamicLocationTime = 0;
        break;
    }
  }

  /**
   * Obtener última ubicación conocida
   */
  getLastKnownLocation(): LocationCoordinates | null {
    console.log('💾 Obteniendo última ubicación conocida');
    
    // Priorizar ubicación más reciente
    const staticAge = this.staticLocationTime;
    const dynamicAge = this.dynamicLocationTime;
    
    if (staticAge > dynamicAge && this.staticLocation) {
      return this.staticLocation;
    } else if (this.dynamicLocation) {
      return this.dynamicLocation;
    } else if (this.staticLocation) {
      return this.staticLocation;
    }
    
    return null;
  }

  /**
   * Validar coordenadas geográficas
   */
  isValidCoordinates(coords: LocationCoordinates): boolean {
    const { latitude, longitude } = coords;
    
    const isValid = latitude !== null && 
                   longitude !== null &&
                   latitude >= -90 && 
                   latitude <= 90 &&
                   longitude >= -180 && 
                   longitude <= 180 &&
                   !(latitude === 0 && longitude === 0);

    if (!isValid) {
      console.error(`❌ Coordenadas inválidas: ${latitude}, ${longitude}`);
    }

    return isValid;
  }

  /**
   * Verificar si las coordenadas están en Ecuador
   */
  isInEcuador(coords: LocationCoordinates): boolean {
    const { latitude, longitude } = coords;
    
    // Límites aproximados de Ecuador
    const isInEcuador = latitude >= -5 && 
                       latitude <= 2 && 
                       longitude >= -92 && 
                       longitude <= -75;

    console.log(`🇪🇨 En Ecuador: ${isInEcuador} (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
    
    return isInEcuador;
  }

  /**
   * Calcular distancia entre dos puntos usando fórmula Haversine
   */
  calculateDistance(
    coords1: LocationCoordinates, 
    coords2: LocationCoordinates
  ): number {
    const R = 6371; // Radio de la Tierra en km
    
    const dLat = this.degreesToRadians(coords2.latitude - coords1.latitude);
    const dLon = this.degreesToRadians(coords2.longitude - coords1.longitude);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.degreesToRadians(coords1.latitude)) * 
              Math.cos(this.degreesToRadians(coords2.latitude)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    console.log(`📏 Distancia calculada: ${distance.toFixed(2)}km`);
    return distance;
  }

  /**
   * Debug del estado completo del servicio
   */
  debugState(): void {
    console.log('\n🌍 === GEOLOCATION DEBUG ===');
    console.log('Estado del servicio:');
    console.log(`  Geolocation disponible: ${!!navigator.geolocation}`);
    console.log(`  Modo dinámico activo: ${this.isInDynamicMode}`);
    console.log(`  Ubicación estática:`, this.staticLocation);
    console.log(`  Cache estático válido: ${this.hasValidStaticCache()}`);
    console.log(`  Ubicación dinámica:`, this.dynamicLocation);
    console.log(`  Cache dinámico válido: ${this.hasValidDynamicCache()}`);
    console.log('🌍 === END DEBUG ===\n');
  }

  // ===== MÉTODOS PRIVADOS =====

  /**
   * Verificar si hay cache estático válido
   */
  private hasValidStaticCache(): boolean {
    if (!this.staticLocation) return false;
    
    const age = Date.now() - this.staticLocationTime;
    const isValid = age < this.staticMode.maximumAge!;
    
    console.log(`📅 Cache estático: ${Math.round(age/1000)}s, válido: ${isValid}`);
    return isValid;
  }

  /**
   * Verificar si hay cache dinámico válido
   */
  private hasValidDynamicCache(): boolean {
    if (!this.dynamicLocation) return false;
    
    const age = Date.now() - this.dynamicLocationTime;
    const isValid = age < this.dynamicMode.maximumAge!;
    
    console.log(`📅 Cache dinámico: ${Math.round(age/1000)}s, válido: ${isValid}`);
    return isValid;
  }

  /**
   * Convertir grados a radianes
   */
  private degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Manejo centralizado de errores de geolocalización
   */
  private handleGeolocationError(error: any): GeolocationError {
    let userMessage = 'Error obteniendo ubicación';
    let code = error.code || 0;

    if (error.code) {
      // Error estándar de geolocalización
      switch (error.code) {
        case 1: // PERMISSION_DENIED
          userMessage = 'Permisos de ubicación denegados. Por favor, permite el acceso a tu ubicación.';
          break;
        case 2: // POSITION_UNAVAILABLE
          userMessage = 'Ubicación no disponible. Verifica que tengas GPS o conexión a internet.';
          break;
        case 3: // TIMEOUT
          userMessage = 'Tiempo de espera agotado obteniendo ubicación. Inténtalo de nuevo.';
          break;
        default:
          userMessage = 'Error desconocido obteniendo ubicación.';
      }
    } else if (error.name === 'TimeoutError') {
      // Error de timeout de RxJS
      code = 3;
      userMessage = 'Tiempo de espera agotado obteniendo ubicación. Inténtalo de nuevo.';
    } else {
      // Otros errores
      userMessage = 'Error interno obteniendo ubicación.';
    }

    return this.createError(code, error.message || 'Unknown error', userMessage);
  }

  /**
   * Crear objeto de error estandardizado
   */
  private createError(code: number, message: string, userMessage: string): GeolocationError {
    return {
      code,
      message,
      userMessage
    };
  }
}
