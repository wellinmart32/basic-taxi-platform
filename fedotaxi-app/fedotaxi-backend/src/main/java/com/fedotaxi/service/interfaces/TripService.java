package com.fedotaxi.service.interfaces;

import com.fedotaxi.model.Driver;
import com.fedotaxi.model.Trip;
import com.fedotaxi.model.TripStatus;
import com.fedotaxi.model.User;
import com.fedotaxi.dto.TripRequestDTO;
import com.fedotaxi.dto.TripResponseDTO;

import java.util.List;
import java.util.Optional;

/**
 * Servicio para gestión completa de viajes
 */
public interface TripService {
    
    /**
     * Crear nuevo viaje con búsqueda automática de conductor
     */
    Trip createTrip(User passenger, TripRequestDTO tripRequest);
    
    /**
     * Actualizar estado del viaje
     */
    Trip updateTripStatus(Long tripId, TripStatus newStatus);
    
    /**
     * Obtener todos los viajes de un pasajero
     */
    List<Trip> getTripsByPassenger(User passenger);
    
    /**
     * Obtener todos los viajes de un conductor
     */
    List<Trip> getTripsByDriver(Driver driver);
    
    /**
     * Obtener viajes activos de un pasajero
     */
    List<Trip> getActiveTripsForPassenger(User passenger);
    
    /**
     * Obtener viajes activos de un conductor
     */
    List<Trip> getActiveTripsForDriver(Driver driver);
    
    /**
     * Verificar si un pasajero tiene viajes activos
     */
    boolean hasActiveTrips(User passenger);
    
    /**
     * Verificar si un conductor tiene viajes activos
     */
    boolean hasActiveTripsDriver(Driver driver);
    
    /**
     * Obtener viaje por ID
     */
    Optional<Trip> getTripById(Long tripId);
    
    /**
     * Cancelar viaje con razón
     */
    Trip cancelTrip(Long tripId, String reason);
    
    /**
     * Completar viaje
     */
    Trip completeTrip(Long tripId);
    
    /**
     * Calcular distancia entre dos puntos usando Haversine
     */
    double calculateDistance(double lat1, double lon1, double lat2, double lon2);
    
    /**
     * Calcular tarifa basada en distancia
     */
    double calculateFare(double distance);
    
    /**
     * Obtener estadísticas de viajes del usuario
     */
    TripStatistics getTripStatistics(User user);
    
    /**
     * Convertir entidad Trip a DTO de respuesta
     */
    TripResponseDTO convertToDTO(Trip trip, TripRequestDTO originalRequest);
    
    /**
     * Clase para estadísticas de viajes
     */
    class TripStatistics {
        private final long totalTrips;
        private final long completedTrips;
        private final double totalDistance;
        private final double totalFare;
        
        public TripStatistics(long totalTrips, long completedTrips, double totalDistance, double totalFare) {
            this.totalTrips = totalTrips;
            this.completedTrips = completedTrips;
            this.totalDistance = totalDistance;
            this.totalFare = totalFare;
        }
        
        public long getTotalTrips() { 
            return totalTrips; 
        }
        
        public long getCompletedTrips() { 
            return completedTrips; 
        }
        
        public double getTotalDistance() { 
            return totalDistance; 
        }
        
        public double getTotalFare() { 
            return totalFare; 
        }
        
        public double getCompletionRate() { 
            return totalTrips > 0 ? (double) completedTrips / totalTrips * 100 : 0;
        }
        
        public double getAverageFare() {
            return completedTrips > 0 ? totalFare / completedTrips : 0;
        }
    }
}
