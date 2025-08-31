package com.fedotaxi.service.interfaces;

import com.fedotaxi.model.Driver;
import com.fedotaxi.dto.DriverDTO;

import java.util.List;
import java.util.Optional;

/**
 * Servicio para gestión completa de conductores
 */
public interface DriverService {
    
    /**
     * Búsqueda inteligente de conductor con radios escalonados
     */
    Optional<Driver> findBestAvailableDriverWithEscalation(Double originLat, Double originLon);
    
    /**
     * Buscar conductores disponibles en radio específico
     */
    List<Driver> findNearbyDrivers(Double latitude, Double longitude, Double radiusKm);
    
    /**
     * Calcular distancia entre dos puntos usando fórmula Haversine
     */
    double calculateDistance(double lat1, double lon1, double lat2, double lon2);
    
    /**
     * Generar reporte de disponibilidad por zona geográfica
     */
    String getZoneAvailabilityReport(Double centerLat, Double centerLon);
    
    /**
     * Obtener conductor por email del usuario
     */
    Optional<Driver> getDriverByEmail(String email);
    
    /**
     * Obtener conductor por ID
     */
    Optional<Driver> getDriverById(Long driverId);
    
    /**
     * Actualizar estado de disponibilidad del conductor
     */
    Driver updateAvailability(String userEmail, boolean available);
    
    /**
     * Actualizar ubicación GPS del conductor
     */
    Driver updateLocation(String userEmail, Double latitude, Double longitude);
    
    /**
     * Obtener listado completo de conductores (solo admin)
     */
    List<DriverDTO> getAllDrivers();
    
    /**
     * Convertir entidad Driver a DTO
     */
    DriverDTO convertToDTO(Driver driver);
    
    /**
     * Búsqueda simple de conductor (método de compatibilidad)
     */
    Optional<Driver> findBestAvailableDriver(Double originLat, Double originLon);
    
    /**
     * Búsqueda con radio específico (método de compatibilidad)
     */
    Optional<Driver> findBestAvailableDriver(Double originLat, Double originLon, Double radiusKm);
}
