import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, tap, catchError, throwError, of } from 'rxjs';
import { TripRequest } from '../../models/trip/trip-request.model';
import { TripStatus } from '../../enums/trip-status.enum';
import { Trip } from '../../models/trip/Trip.model';

@Injectable({
  providedIn: 'root'
})
export class TripService {
  private readonly API_URL = 'http://localhost:8081/api/trips';

  constructor(private http: HttpClient) {
    console.log('🚖 TripService inicializado');
  }

  /**
   * Solicitar un nuevo viaje con validaciones
   */
  requestTrip(tripRequest: TripRequest): Observable<Trip> {
    console.log('🚖 Solicitando viaje:', tripRequest.originAddress);
    
    if (!this.isValidTripRequest(tripRequest)) {
      return throwError(() => new Error('Datos del viaje inválidos'));
    }
    
    return this.http.post<Trip>(`${this.API_URL}/request`, tripRequest).pipe(
      tap(trip => {
        console.log(`✅ Viaje solicitado: #${trip.id}`);
        this.notifyTripCreated(trip);
      }),
      catchError(error => {
        console.error('❌ Error solicitando viaje:', error);
        return throwError(() => this.handleTripError(error, 'solicitar viaje'));
      })
    );
  }

  /**
   * Obtener mis viajes ordenados por fecha
   */
  getMyTrips(): Observable<Trip[]> {
    console.log('📋 Obteniendo mis viajes');
    
    return this.http.get<Trip[]>(`${this.API_URL}/my-trips`).pipe(
      tap(trips => {
        console.log(`✅ ${trips.length} viajes obtenidos`);
      }),
      map(trips => {
        // Ordenar por fecha más reciente
        return trips.sort((a, b) => {
          const dateA = new Date(a.requestTime).getTime();
          const dateB = new Date(b.requestTime).getTime();
          return dateB - dateA;
        });
      }),
      catchError(error => {
        console.error('❌ Error obteniendo viajes:', error);
        return throwError(() => this.handleTripError(error, 'obtener viajes'));
      })
    );
  }

  /**
   * Obtener un viaje específico por ID
   */
  getTripById(tripId: number): Observable<Trip> {
    console.log(`🔍 Obteniendo viaje #${tripId}`);
    
    if (!tripId || tripId <= 0) {
      return throwError(() => new Error('ID de viaje inválido'));
    }
    
    return this.http.get<Trip>(`${this.API_URL}/${tripId}`).pipe(
      tap(trip => {
        console.log(`✅ Viaje obtenido: #${trip.id}`);
      }),
      catchError(error => {
        console.error('❌ Error obteniendo viaje:', error);
        return throwError(() => this.handleTripError(error, 'obtener viaje'));
      })
    );
  }

  /**
   * Actualizar estado del viaje con validaciones
   */
  updateTripStatus(tripId: number, status: TripStatus): Observable<Trip> {
    console.log(`🔄 Actualizando viaje #${tripId} a ${status}`);
    
    if (!tripId || tripId <= 0) {
      return throwError(() => new Error('ID de viaje inválido'));
    }
    
    if (!this.isValidStatusTransition(status)) {
      return throwError(() => new Error('Transición de estado inválida'));
    }
    
    return this.http.put<Trip>(`${this.API_URL}/${tripId}/status`, { status }).pipe(
      tap(trip => {
        console.log(`✅ Estado actualizado: #${trip.id} -> ${status}`);
        this.notifyTripUpdated(trip, status);
      }),
      catchError(error => {
        console.error('❌ Error actualizando estado:', error);
        return throwError(() => this.handleTripError(error, 'actualizar estado del viaje'));
      })
    );
  }

  /**
   * Cancelar viaje
   */
  cancelTrip(tripId: number): Observable<Trip> {
    console.log(`❌ Cancelando viaje #${tripId}`);
    return this.updateTripStatus(tripId, TripStatus.CANCELLED);
  }

  /**
   * Aceptar viaje (para conductores)
   */
  acceptTrip(tripId: number): Observable<Trip> {
    console.log(`✅ Aceptando viaje #${tripId}`);
    return this.updateTripStatus(tripId, TripStatus.ACCEPTED);
  }

  /**
   * Iniciar viaje (para conductores)
   */
  startTrip(tripId: number): Observable<Trip> {
    console.log(`🚀 Iniciando viaje #${tripId}`);
    return this.updateTripStatus(tripId, TripStatus.IN_PROGRESS);
  }

  /**
   * Completar viaje (para conductores)
   */
  completeTrip(tripId: number): Observable<Trip> {
    console.log(`🏁 Completando viaje #${tripId}`);
    return this.updateTripStatus(tripId, TripStatus.COMPLETED);
  }

  /**
   * Obtener viajes disponibles para conductores
   */
  getAvailableTrips(): Observable<Trip[]> {
    console.log('📋 Obteniendo viajes disponibles');
    
    return this.http.get<Trip[]>(`${this.API_URL}/available`).pipe(
      tap(trips => {
        console.log(`✅ ${trips.length} viajes disponibles`);
      }),
      catchError(error => {
        console.error('❌ Error obteniendo viajes disponibles:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtener historial de viajes
   */
  getTripHistory(): Observable<Trip[]> {
    console.log('📋 Obteniendo historial de viajes');
    
    return this.http.get<Trip[]>(`${this.API_URL}/history`).pipe(
      tap(trips => {
        console.log(`✅ Historial obtenido: ${trips.length} viajes`);
      }),
      catchError(error => {
        console.error('❌ Error obteniendo historial:', error);
        return throwError(() => this.handleTripError(error, 'obtener historial'));
      })
    );
  }

  /**
   * Obtener viajes activos (en progreso)
   */
  getActiveTrips(): Observable<Trip[]> {
    console.log('📋 Obteniendo viajes activos');
    
    return this.http.get<Trip[]>(`${this.API_URL}/active`).pipe(
      tap(trips => {
        console.log(`✅ ${trips.length} viajes activos`);
      }),
      catchError(error => {
        console.error('❌ Error obteniendo viajes activos:', error);
        return of([]);
      })
    );
  }

  /**
   * Obtener viaje actual del usuario
   */
  getCurrentTrip(): Observable<Trip | null> {
    console.log('🔍 Obteniendo viaje actual');
    
    return this.http.get<Trip | null>(`${this.API_URL}/current`).pipe(
      tap(trip => {
        console.log(`✅ Viaje actual: ${trip ? '#' + trip.id : 'ninguno'}`);
      }),
      catchError(error => {
        console.warn('⚠️ Error obteniendo viaje actual:', error.message);
        return of(null);
      })
    );
  }

  /**
   * Verificar si el usuario tiene un viaje activo
   */
  hasActiveTrip(): Observable<boolean> {
    return this.getCurrentTrip().pipe(
      map(trip => {
        const hasActive = trip !== null && 
          [TripStatus.REQUESTED, TripStatus.ACCEPTED, TripStatus.IN_PROGRESS].includes(trip.status);
        console.log(`🔍 Tiene viaje activo: ${hasActive}`);
        return hasActive;
      })
    );
  }

  /**
   * Obtener estadísticas de viajes del usuario
   */
  getTripStatistics(): Observable<any> {
    console.log('📊 Obteniendo estadísticas de viajes');
    
    return this.http.get(`${this.API_URL}/statistics`).pipe(
      tap(stats => {
        console.log('✅ Estadísticas obtenidas:', stats);
      }),
      catchError(error => {
        console.error('❌ Error obteniendo estadísticas:', error);
        return of({
          totalTrips: 0,
          completedTrips: 0,
          cancelledTrips: 0,
          totalDistance: 0,
          totalFare: 0,
          averageRating: 0
        });
      })
    );
  }

  /**
   * Verificar disponibilidad del servicio
   */
  checkServiceAvailability(): Observable<boolean> {
    return this.http.get<{ available: boolean }>(`${this.API_URL}/health`).pipe(
      map(response => response.available),
      catchError(() => of(false))
    );
  }

  // ===== MÉTODOS DE CÁLCULO =====

  /**
   * Calcular tarifa estimada basada en distancia
   */
  calculateFare(distance: number): number {
    const baseFare = 2.50; // Tarifa base en $
    const perKmRate = 0.80; // Tarifa por kilómetro en $
    return baseFare + (distance * perKmRate);
  }

  /**
   * Calcular distancia entre dos puntos usando fórmula Haversine
   */
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radio de la Tierra en kilómetros
    const dLat = this.degreesToRadians(lat2 - lat1);
    const dLon = this.degreesToRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.degreesToRadians(lat1)) * Math.cos(this.degreesToRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Estimar tiempo de viaje considerando tráfico
   */
  estimateTripDuration(distance: number, trafficFactor: number = 1): number {
    const baseSpeed = 30; // km/h velocidad base en ciudad
    const adjustedSpeed = baseSpeed / trafficFactor;
    const durationHours = distance / adjustedSpeed;
    return Math.round(durationHours * 60); // Devolver en minutos
  }

  // ===== MÉTODOS PRIVADOS DE VALIDACIÓN =====

  /**
   * Validar datos de solicitud de viaje
   */
  private isValidTripRequest(tripRequest: TripRequest): boolean {
    if (!tripRequest.originAddress || !tripRequest.destinationAddress) {
      console.error('❌ Direcciones faltantes');
      return false;
    }
    
    if (!this.isValidCoordinates(tripRequest.originLatitude, tripRequest.originLongitude) ||
        !this.isValidCoordinates(tripRequest.destinationLatitude, tripRequest.destinationLongitude)) {
      console.error('❌ Coordenadas inválidas');
      return false;
    }
    
    // Verificar que origen y destino no sean iguales
    const distance = this.calculateDistance(
      tripRequest.originLatitude, tripRequest.originLongitude,
      tripRequest.destinationLatitude, tripRequest.destinationLongitude
    );
    
    if (distance < 0.1) { // Menos de 100 metros
      console.error('❌ Origen y destino muy cercanos');
      return false;
    }
    
    return true;
  }

  /**
   * Validar coordenadas geográficas
   */
  private isValidCoordinates(latitude: number, longitude: number): boolean {
    return latitude >= -90 && latitude <= 90 && 
           longitude >= -180 && longitude <= 180 &&
           !(latitude === 0 && longitude === 0);
  }

  /**
   * Validar transición de estado del viaje
   */
  private isValidStatusTransition(status: TripStatus): boolean {
    const validStatuses = Object.values(TripStatus);
    return validStatuses.includes(status);
  }

  /**
   * Convertir grados a radianes para cálculos geográficos
   */
  private degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Manejo centralizado de errores HTTP
   */
  private handleTripError(error: any, operation: string): Error {
    let message = `Error al ${operation}`;
    
    if (error.status) {
      switch (error.status) {
        case 400:
          message = `Datos inválidos para ${operation}`;
          break;
        case 401:
          message = 'No estás autorizado para realizar esta acción';
          break;
        case 403:
          message = 'No tienes permisos para acceder a este viaje';
          break;
        case 404:
          message = 'Viaje no encontrado';
          break;
        case 409:
          message = 'Conflicto: el viaje ya fue modificado por otro usuario';
          break;
        case 500:
          message = 'Error interno del servidor. Inténtalo más tarde';
          break;
        default:
          message = `Error de red al ${operation}`;
      }
    } else if (error.message) {
      message = error.message;
    }
    
    console.error(`🚨 TripService Error: ${message}`);
    return new Error(message);
  }

  /**
   * Notificar creación de viaje para futuras integraciones
   */
  private notifyTripCreated(trip: Trip): void {
    console.log(`🔔 Viaje creado: #${trip.id}`);
    
    // Aquí se pueden integrar notificaciones push o eventos
    // this.notificationService.notify(`Viaje ${trip.id} creado exitosamente`);
    // this.eventBus.emit('trip-created', trip);
  }

  /**
   * Notificar actualización de estado del viaje
   */
  private notifyTripUpdated(trip: Trip, newStatus: TripStatus): void {
    console.log(`🔔 Viaje #${trip.id} actualizado a ${newStatus}`);
    
    switch (newStatus) {
      case TripStatus.ACCEPTED:
        console.log('✅ Viaje aceptado por conductor');
        break;
      case TripStatus.IN_PROGRESS:
        console.log('🚗 Viaje iniciado');
        break;
      case TripStatus.COMPLETED:
        console.log('🎉 Viaje completado exitosamente');
        break;
      case TripStatus.CANCELLED:
        console.log('❌ Viaje cancelado');
        break;
    }
    
    // Aquí se pueden integrar notificaciones o WebSockets
    // this.notificationService.notify(this.getStatusMessage(newStatus));
    // this.eventBus.emit('trip-status-changed', { trip, newStatus });
  }
}
