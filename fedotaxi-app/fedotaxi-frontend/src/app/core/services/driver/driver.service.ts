import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, tap, catchError, throwError, map, retry } from 'rxjs';
import { Driver } from '../../models/driver/driver.model';

export interface SearchConfig {
  initialRadius: number;    // Radio inicial (urbano)
  extendedRadius: number;   // Radio extendido (suburbano)
  maxRadius: number;        // Radio máximo (rural/emergencia)
  retryDelay: number;       // Delay entre intentos
}

export interface SearchResult {
  drivers: Driver[];
  radiusUsed: number;
  searchTime: number;
  totalAttempts: number;
}

@Injectable({
  providedIn: 'root'
})
export class DriverService {
  private readonly API_URL = 'http://localhost:8081/api/drivers';

  // Configuración de búsqueda escalonada para Guayaquil
  private readonly SEARCH_CONFIG: SearchConfig = {
    initialRadius: 5,      // 5km - Centro urbano
    extendedRadius: 12,    // 12km - Zona metropolitana  
    maxRadius: 25,         // 25km - Área extendida
    retryDelay: 2000       // 2 segundos entre intentos
  };

  // Cache de conductores por ubicación
  private driversCache = new Map<string, { drivers: Driver[], timestamp: number }>();
  private readonly CACHE_DURATION = 30000; // 30 segundos

  constructor(private http: HttpClient) {
    console.log('🚗 DriverService inicializado con búsqueda escalonada');
  }

  /**
   * Búsqueda inteligente escalonada de conductores
   */
  findNearbyDriversIntelligent(latitude: number, longitude: number): Observable<SearchResult> {
    console.log(`🔍 Iniciando búsqueda inteligente en: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);

    const startTime = Date.now();
    
    return new Observable<SearchResult>(observer => {
      this.performEscalatedSearch(latitude, longitude, startTime, 1)
        .subscribe({
          next: (result) => {
            console.log(`✅ Búsqueda completada: ${result.drivers.length} conductores en ${result.radiusUsed}km`);
            observer.next(result);
            observer.complete();
          },
          error: (error) => {
            console.error('❌ Error en búsqueda inteligente:', error);
            observer.next({
              drivers: [],
              radiusUsed: 0,
              searchTime: Date.now() - startTime,
              totalAttempts: 1
            });
            observer.complete();
          }
        });
    });
  }

  /**
   * Obtener información del conductor actual
   */
  getMyDriverInfo(): Observable<Driver> {
    console.log('🚗 Obteniendo información del conductor');
    
    return this.http.get<Driver>(`${this.API_URL}/me`).pipe(
      tap(driver => {
        console.log(`✅ Información obtenida: ${driver.firstName} ${driver.lastName}`);
        this.validateDriverData(driver);
      }),
      catchError(error => {
        console.error('❌ Error obteniendo información:', error);
        return throwError(() => this.handleDriverError(error, 'obtener información del conductor'));
      })
    );
  }

  /**
   * Actualizar disponibilidad del conductor
   */
  updateAvailability(available: boolean): Observable<any> {
    console.log(`🔄 Actualizando disponibilidad: ${available ? 'disponible' : 'no disponible'}`);
    
    this.clearDriversCache();
    
    return this.http.put(`${this.API_URL}/status`, { available }).pipe(
      tap(() => {
        console.log('✅ Disponibilidad actualizada exitosamente');
        this.notifyAvailabilityChange(available);
      }),
      catchError(error => {
        console.error('❌ Error actualizando disponibilidad:', error);
        return throwError(() => this.handleDriverError(error, 'actualizar disponibilidad'));
      })
    );
  }

  /**
   * Actualizar ubicación del conductor
   */
  updateLocation(latitude: number, longitude: number): Observable<any> {
    console.log(`📍 Actualizando ubicación: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    
    if (!this.isValidCoordinates(latitude, longitude)) {
      return throwError(() => new Error('Coordenadas inválidas para actualizar ubicación'));
    }
    
    const locationData = {
      latitude, 
      longitude,
      timestamp: new Date().toISOString()
    };
    
    this.clearDriversCache();
    
    return this.http.put(`${this.API_URL}/location`, locationData).pipe(
      tap(() => {
        console.log('✅ Ubicación actualizada exitosamente');
      }),
      catchError(error => {
        console.error('❌ Error actualizando ubicación:', error);
        return throwError(() => this.handleDriverError(error, 'actualizar ubicación'));
      })
    );
  }

  /**
   * Obtener conductores cercanos con cache y ordenamiento
   */
  getNearbyDrivers(latitude: number, longitude: number, radiusKm: number): Observable<Driver[]> {
    console.log(`🔍 Buscando conductores en radio de ${radiusKm}km`);
    
    if (!this.isValidCoordinates(latitude, longitude)) {
      return throwError(() => new Error('Coordenadas inválidas para búsqueda'));
    }
    
    if (radiusKm <= 0 || radiusKm > 50) {
      return throwError(() => new Error('Radio de búsqueda inválido (debe estar entre 0.1 y 50 km)'));
    }

    // Verificar cache
    const cacheKey = `${latitude.toFixed(4)}_${longitude.toFixed(4)}_${radiusKm}`;
    const cached = this.driversCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      console.log(`⚡ Usando ${cached.drivers.length} conductores desde cache`);
      return of(cached.drivers);
    }
    
    const params = {
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      radius: radiusKm.toString()
    };
    
    return this.http.get<Driver[]>(`${this.API_URL}/nearby`, { params }).pipe(
      retry({count: 2, delay: 1000}),
      
      tap(drivers => {
        console.log(`✅ ${drivers.length} conductores encontrados`);
        
        // Guardar en cache
        this.driversCache.set(cacheKey, {
          drivers,
          timestamp: Date.now()
        });
      }),
      map(drivers => {
        // Filtrar y ordenar conductores válidos
        const validDrivers = drivers.filter(driver => this.isValidDriverForAssignment(driver));
        console.log(`✅ ${validDrivers.length} conductores válidos para asignación`);
        
        // Ordenar por distancia
        validDrivers.sort((a, b) => {
          if (!a.currentLatitude || !a.currentLongitude || !b.currentLatitude || !b.currentLongitude) {
            return 0;
          }
          
          const distanceA = this.calculateDistance(latitude, longitude, a.currentLatitude, a.currentLongitude);
          const distanceB = this.calculateDistance(latitude, longitude, b.currentLatitude, b.currentLongitude);
          
          return distanceA - distanceB;
        });
        
        return validDrivers;
      }),
      catchError(error => {
        console.error('❌ Error buscando conductores:', error);
        return throwError(() => this.handleDriverError(error, 'buscar conductores cercanos'));
      })
    );
  }

  /**
   * Obtener todos los conductores disponibles
   */
  getAvailableDrivers(): Observable<Driver[]> {
    console.log('📋 Obteniendo conductores disponibles');
    
    return this.http.get<Driver[]>(`${this.API_URL}/available`).pipe(
      tap(drivers => {
        console.log(`✅ ${drivers.length} conductores disponibles`);
      }),
      map(drivers => drivers.filter(driver => this.isValidDriverForAssignment(driver))),
      catchError(error => {
        console.error('❌ Error obteniendo conductores disponibles:', error);
        return of([]);
      })
    );
  }

  /**
   * Registrar nuevo conductor
   */
  registerDriver(driverData: any): Observable<Driver> {
    console.log('📝 Registrando nuevo conductor');
    
    if (!this.isValidDriverData(driverData)) {
      return throwError(() => new Error('Datos del conductor inválidos'));
    }
    
    return this.http.post<Driver>(`${this.API_URL}/register`, driverData).pipe(
      tap(driver => {
        console.log(`✅ Conductor registrado: #${driver.id}`);
      }),
      catchError(error => {
        console.error('❌ Error registrando conductor:', error);
        return throwError(() => this.handleDriverError(error, 'registrar conductor'));
      })
    );
  }

  /**
   * Actualizar información del conductor
   */
  updateDriverInfo(driverData: Partial<Driver>): Observable<Driver> {
    console.log('🔄 Actualizando información del conductor');
    
    return this.http.put<Driver>(`${this.API_URL}/me`, driverData).pipe(
      tap(driver => {
        console.log('✅ Información actualizada');
        this.validateDriverData(driver);
      }),
      catchError(error => {
        console.error('❌ Error actualizando información:', error);
        return throwError(() => this.handleDriverError(error, 'actualizar información del conductor'));
      })
    );
  }

  /**
   * Obtener estadísticas del conductor
   */
  getDriverStats(): Observable<any> {
    console.log('📊 Obteniendo estadísticas del conductor');
    
    return this.http.get(`${this.API_URL}/stats`).pipe(
      tap(stats => {
        console.log('✅ Estadísticas obtenidas:', stats);
      }),
      catchError(error => {
        console.error('❌ Error obteniendo estadísticas:', error);
        return of({
          totalTrips: 0,
          completedTrips: 0,
          totalEarnings: 0,
          averageRating: 0,
          totalDistance: 0,
          workingHours: 0
        });
      })
    );
  }

  /**
   * Verificar disponibilidad del servicio
   */
  checkServiceHealth(): Observable<boolean> {
    return this.http.get<{ status: string }>(`${this.API_URL}/health`).pipe(
      map(response => response.status === 'healthy'),
      catchError(() => of(false))
    );
  }

  /**
   * Limpiar cache de conductores
   */
  clearDriversCache(): void {
    console.log('🧹 Limpiando cache de conductores');
    this.driversCache.clear();
  }

  /**
   * Limpiar cache específico por ubicación
   */
  clearCacheForLocation(latitude: number, longitude: number): void {
    const keysToDelete: string[] = [];
    
    for (const [key] of this.driversCache) {
      const [lat, lng] = key.split('_');
      if (Math.abs(parseFloat(lat) - latitude) < 0.01 && 
          Math.abs(parseFloat(lng) - longitude) < 0.01) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.driversCache.delete(key));
    console.log(`🧹 Cache limpiado para ubicación: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
  }

  /**
   * Obtener configuración actual de búsqueda
   */
  getSearchConfig(): SearchConfig {
    return { ...this.SEARCH_CONFIG };
  }

  /**
   * Obtener estadísticas de cache
   */
  getCacheStats(): { size: number, keys: string[] } {
    return {
      size: this.driversCache.size,
      keys: Array.from(this.driversCache.keys())
    };
  }

  // ===== MÉTODOS PRIVADOS =====

  /**
   * Realizar búsqueda escalonada recursiva
   */
  private performEscalatedSearch(
    latitude: number, 
    longitude: number, 
    startTime: number, 
    attempt: number
  ): Observable<SearchResult> {
    
    let radius: number;
    let searchPhase: string;

    switch (attempt) {
      case 1:
        radius = this.SEARCH_CONFIG.initialRadius;
        searchPhase = 'urbano';
        break;
      case 2:
        radius = this.SEARCH_CONFIG.extendedRadius;
        searchPhase = 'metropolitano';
        break;
      case 3:
        radius = this.SEARCH_CONFIG.maxRadius;
        searchPhase = 'regional';
        break;
      default:
        return of({
          drivers: [],
          radiusUsed: this.SEARCH_CONFIG.maxRadius,
          searchTime: Date.now() - startTime,
          totalAttempts: attempt - 1
        });
    }

    console.log(`🎯 Intento ${attempt}: Búsqueda ${searchPhase} (${radius}km)`);

    return this.getNearbyDrivers(latitude, longitude, radius).pipe(
      map((drivers) => {
        const searchTime = Date.now() - startTime;
        
        if (drivers.length > 0) {
          console.log(`✅ Éxito en intento ${attempt}: ${drivers.length} conductores`);
          return {
            drivers,
            radiusUsed: radius,
            searchTime,
            totalAttempts: attempt
          };
        } else {
          console.log(`⚠️ Intento ${attempt} sin resultados, escalando...`);
          throw new Error(`No drivers found in radius ${radius}km`);
        }
      }),
      catchError((error) => {
        if (attempt < 3) {
          return new Observable<SearchResult>(observer => {
            setTimeout(() => {
              this.performEscalatedSearch(latitude, longitude, startTime, attempt + 1)
                .subscribe(observer);
            }, this.SEARCH_CONFIG.retryDelay);
          });
        } else {
          console.log('❌ Agotados todos los radios de búsqueda');
          return of({
            drivers: [],
            radiusUsed: this.SEARCH_CONFIG.maxRadius,
            searchTime: Date.now() - startTime,
            totalAttempts: attempt
          });
        }
      })
    );
  }

  /**
   * Validar coordenadas geográficas
   */
  private isValidCoordinates(latitude: number, longitude: number): boolean {
    const isValid = latitude >= -90 && latitude <= 90 && 
                   longitude >= -180 && longitude <= 180 &&
                   !(latitude === 0 && longitude === 0);
    
    if (!isValid) {
      console.warn(`⚠️ Coordenadas inválidas: ${latitude}, ${longitude}`);
    }
    
    return isValid;
  }

  /**
   * Validar datos del conductor para registro
   */
  private isValidDriverData(driverData: any): boolean {
    const required = ['licenseNumber', 'vehicleModel', 'vehiclePlate'];
    
    for (const field of required) {
      if (!driverData[field] || driverData[field].trim().length === 0) {
        console.error(`❌ Campo requerido faltante: ${field}`);
        return false;
      }
    }
    
    // Validar formato de placa para Ecuador
    const platePattern = /^[A-Z]{3}-\d{3,4}$/;
    if (!platePattern.test(driverData.vehiclePlate)) {
      console.error(`❌ Formato de placa inválido: ${driverData.vehiclePlate}`);
      return false;
    }
    
    return true;
  }

  /**
   * Validar completitud de datos del conductor
   */
  private validateDriverData(driver: Driver): void {
    const warnings: string[] = [];
    
    if (!driver.licenseNumber) warnings.push('Número de licencia faltante');
    if (!driver.vehicleModel) warnings.push('Modelo de vehículo faltante');
    if (!driver.vehiclePlate) warnings.push('Placa de vehículo faltante');
    if (!driver.phone) warnings.push('Teléfono faltante');
    
    if (warnings.length > 0) {
      console.warn('⚠️ Datos del conductor incompletos:', warnings);
    }
  }

  /**
   * Validar conductor para asignación de viajes
   */
  private isValidDriverForAssignment(driver: Driver): boolean {
    // Debe estar disponible
    if (!driver.available) {
      return false;
    }
    
    // Debe tener ubicación actual válida
    if (!driver.currentLatitude || !driver.currentLongitude) {
      return false;
    }
    
    // Las coordenadas deben ser válidas
    if (!this.isValidCoordinates(driver.currentLatitude, driver.currentLongitude)) {
      return false;
    }
    
    // Debe tener datos básicos del vehículo
    if (!driver.vehicleModel || !driver.vehiclePlate) {
      return false;
    }
    
    return true;
  }

  /**
   * Calcular distancia entre dos puntos usando fórmula Haversine
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radio de la Tierra en km
    const dLat = this.degreesToRadians(lat2 - lat1);
    const dLon = this.degreesToRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.degreesToRadians(lat1)) * Math.cos(this.degreesToRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convertir grados a radianes
   */
  private degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Manejo centralizado de errores HTTP
   */
  private handleDriverError(error: any, operation: string): Error {
    let message = `Error al ${operation}`;
    
    if (error.status) {
      switch (error.status) {
        case 400:
          message = `Datos inválidos para ${operation}`;
          break;
        case 401:
          message = 'No estás autorizado como conductor';
          break;
        case 403:
          message = 'No tienes permisos de conductor activos';
          break;
        case 404:
          message = 'Perfil de conductor no encontrado';
          break;
        case 409:
          message = 'Conflicto: otro conductor ya realizó esta acción';
          break;
        case 422:
          message = 'Datos del conductor no válidos o incompletos';
          break;
        case 500:
          message = 'Error interno del servidor. Inténtalo más tarde';
          break;
        case 503:
          message = 'Servicio temporalmente no disponible';
          break;
        default:
          message = `Error de red al ${operation}`;
      }
    } else if (error.message) {
      message = error.message;
    }
    
    console.error(`🚨 DriverService Error: ${message}`);
    return new Error(message);
  }

  /**
   * Notificar cambio de disponibilidad
   */
  private notifyAvailabilityChange(available: boolean): void {
    if (available) {
      console.log('🟢 Conductor disponible para viajes');
    } else {
      console.log('🔴 Conductor no disponible');
    }
    
    // Aquí se pueden integrar notificaciones push o eventos
    // this.notificationService.notify(message);
    // this.eventBus.emit('driver-availability-changed', { available });
  }
}
