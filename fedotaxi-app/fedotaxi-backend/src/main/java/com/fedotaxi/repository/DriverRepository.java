package com.fedotaxi.repository;

import com.fedotaxi.model.Driver;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DriverRepository extends JpaRepository<Driver, Long> {
    
    /**
     * Buscar conductor por email del usuario
     */
    @Query("SELECT d FROM Driver d JOIN d.user u WHERE u.email = :email")
    Optional<Driver> findByUserEmail(@Param("email") String email);
    
    /**
     * Buscar conductor por ID de usuario
     */
    Optional<Driver> findByUserId(Long userId);
    
    /**
     * Obtener todos los conductores disponibles
     */
    List<Driver> findByAvailableTrue();
    
    /**
     * Obtener conductores disponibles con ubicación válida
     */
    @Query("SELECT d FROM Driver d WHERE d.available = true AND " +
           "d.currentLatitude IS NOT NULL AND d.currentLongitude IS NOT NULL")
    List<Driver> findAvailableDriversWithLocation();
    
    /**
     * Buscar conductores cercanos usando fórmula Haversine
     */
    @Query(value = "SELECT d.* FROM drivers d " +
           "INNER JOIN users u ON d.user_id = u.id " +
           "WHERE d.available = true " +
           "AND d.current_latitude IS NOT NULL " +
           "AND d.current_longitude IS NOT NULL " +
           "AND (" +
           "   6371 * acos(" +
           "       cos(radians(:latitude)) * cos(radians(d.current_latitude)) * " +
           "       cos(radians(d.current_longitude) - radians(:longitude)) + " +
           "       sin(radians(:latitude)) * sin(radians(d.current_latitude))" +
           "   )" +
           ") <= :radiusKm " +
           "ORDER BY (" +
           "   6371 * acos(" +
           "       cos(radians(:latitude)) * cos(radians(d.current_latitude)) * " +
           "       cos(radians(d.current_longitude) - radians(:longitude)) + " +
           "       sin(radians(:latitude)) * sin(radians(d.current_latitude))" +
           "   )" +
           ") ASC " +
           "LIMIT 20", 
           nativeQuery = true)
    List<Driver> findNearbyDriversWithDistance(@Param("latitude") Double latitude, 
                                              @Param("longitude") Double longitude, 
                                              @Param("radiusKm") Double radiusKm);
    
    /**
     * Búsqueda simple por área rectangular (método de respaldo)
     */
    @Query("SELECT d FROM Driver d WHERE d.available = true AND " +
           "d.currentLatitude IS NOT NULL AND d.currentLongitude IS NOT NULL AND " +
           "d.currentLatitude BETWEEN :minLat AND :maxLat AND " +
           "d.currentLongitude BETWEEN :minLon AND :maxLon " +
           "ORDER BY d.id")
    List<Driver> findNearbyDriversSimple(@Param("minLat") Double minLat, 
                                        @Param("maxLat") Double maxLat,
                                        @Param("minLon") Double minLon, 
                                        @Param("maxLon") Double maxLon);
    
    /**
     * Buscar el conductor más cercano disponible
     */
    @Query(value = "SELECT d.* FROM drivers d " +
           "INNER JOIN users u ON d.user_id = u.id " +
           "WHERE d.available = true " +
           "AND d.current_latitude IS NOT NULL " +
           "AND d.current_longitude IS NOT NULL " +
           "AND (" +
           "   6371 * acos(" +
           "       cos(radians(:latitude)) * cos(radians(d.current_latitude)) * " +
           "       cos(radians(d.current_longitude) - radians(:longitude)) + " +
           "       sin(radians(:latitude)) * sin(radians(d.current_latitude))" +
           "   )" +
           ") <= :maxRadius " +
           "ORDER BY (" +
           "   6371 * acos(" +
           "       cos(radians(:latitude)) * cos(radians(d.current_latitude)) * " +
           "       cos(radians(d.current_longitude) - radians(:longitude)) + " +
           "       sin(radians(:latitude)) * sin(radians(d.current_latitude))" +
           "   )" +
           ") ASC " +
           "LIMIT 1", 
           nativeQuery = true)
    Optional<Driver> findClosestAvailableDriver(@Param("latitude") Double latitude, 
                                               @Param("longitude") Double longitude, 
                                               @Param("maxRadius") Double maxRadius);
    
    /**
     * Contar conductores disponibles en un radio específico
     */
    @Query(value = "SELECT COUNT(*) FROM drivers d " +
           "INNER JOIN users u ON d.user_id = u.id " +
           "WHERE d.available = true " +
           "AND d.current_latitude IS NOT NULL " +
           "AND d.current_longitude IS NOT NULL " +
           "AND (" +
           "   6371 * acos(" +
           "       cos(radians(:latitude)) * cos(radians(d.current_latitude)) * " +
           "       cos(radians(d.current_longitude) - radians(:longitude)) + " +
           "       sin(radians(:latitude)) * sin(radians(d.current_latitude))" +
           "   )" +
           ") <= :radiusKm", 
           nativeQuery = true)
    Long countDriversInRadius(@Param("latitude") Double latitude, 
                             @Param("longitude") Double longitude, 
                             @Param("radiusKm") Double radiusKm);
}
