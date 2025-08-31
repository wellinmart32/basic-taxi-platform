package com.fedotaxi.service.impl;

import com.fedotaxi.dto.DriverDTO;
import com.fedotaxi.model.Driver;
import com.fedotaxi.model.User;
import com.fedotaxi.repository.DriverRepository;
import com.fedotaxi.service.interfaces.DriverService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class DriverServiceImpl implements DriverService {
    
    @Autowired
    private DriverRepository driverRepository;
    
    private static final double URBAN_RADIUS = 5.0;
    private static final double METRO_RADIUS = 12.0;
    private static final double EXTENDED_RADIUS = 25.0;
    private static final double MAX_RADIUS = 50.0;

    /**
     * Búsqueda escalonada con múltiples radios hasta encontrar conductor disponible
     */
    @Override
    public Optional<Driver> findBestAvailableDriverWithEscalation(Double originLat, Double originLon) {
        System.out.println("Iniciando búsqueda escalonada de conductor");
        
        if (!isValidCoordinate(originLat, originLon)) {
            System.out.println("Coordenadas inválidas para búsqueda");
            return Optional.empty();
        }
        
        System.out.println("Búsqueda en radio urbano: " + URBAN_RADIUS + "km");
        Optional<Driver> urbanDriver = findDriverInRadius(originLat, originLon, URBAN_RADIUS);
        if (urbanDriver.isPresent()) {
            System.out.println("Conductor encontrado en radio urbano");
            return urbanDriver;
        }
        
        System.out.println("Búsqueda en radio metropolitano: " + METRO_RADIUS + "km");
        Optional<Driver> metroDriver = findDriverInRadius(originLat, originLon, METRO_RADIUS);
        if (metroDriver.isPresent()) {
            System.out.println("Conductor encontrado en radio metropolitano");
            return metroDriver;
        }
        
        System.out.println("Búsqueda en radio extendido: " + EXTENDED_RADIUS + "km");
        Optional<Driver> extendedDriver = findDriverInRadius(originLat, originLon, EXTENDED_RADIUS);
        if (extendedDriver.isPresent()) {
            System.out.println("Conductor encontrado en radio extendido");
            return extendedDriver;
        }
        
        System.out.println("Búsqueda en radio máximo: " + MAX_RADIUS + "km");
        Optional<Driver> maxDriver = findDriverInRadius(originLat, originLon, MAX_RADIUS);
        if (maxDriver.isPresent()) {
            System.out.println("Conductor encontrado en radio máximo");
            return maxDriver;
        }
        
        System.out.println("No se encontraron conductores disponibles en ningún radio");
        return Optional.empty();
    }

    @Override
    public List<Driver> findNearbyDrivers(Double latitude, Double longitude, Double radiusKm) {
        System.out.println("Buscando conductores cercanos en radio: " + radiusKm + "km");
        
        if (!isValidCoordinate(latitude, longitude)) {
            System.out.println("Coordenadas inválidas");
            throw new IllegalArgumentException("Coordenadas inválidas");
        }
        
        if (radiusKm <= 0 || radiusKm > MAX_RADIUS) {
            System.out.println("Radio inválido: " + radiusKm);
            throw new IllegalArgumentException("Radio debe estar entre 0.1 y " + MAX_RADIUS + " km");
        }
        
        try {
            List<Driver> drivers = driverRepository.findNearbyDriversWithDistance(latitude, longitude, radiusKm);
            System.out.println("Encontrados " + drivers.size() + " conductores cercanos");
            return drivers;
        } catch (Exception e) {
            System.out.println("Fallback a búsqueda por área cuadrada");
            return findDriversInSquareArea(latitude, longitude, radiusKm);
        }
    }

    /**
     * Calcular distancia usando fórmula Haversine para coordenadas geográficas
     */
    @Override
    public double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
            System.out.println("Coordenadas inválidas para cálculo de distancia");
            return Double.MAX_VALUE;
        }
        
        final int R = 6371;
        
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    }

    /**
     * Generar reporte de disponibilidad por zonas concéntricas
     */
    @Override
    public String getZoneAvailabilityReport(Double centerLat, Double centerLon) {
        System.out.println("Generando reporte de disponibilidad");
        
        if (!isValidCoordinate(centerLat, centerLon)) {
            return "Coordenadas inválidas para reporte";
        }
        
        StringBuilder report = new StringBuilder();
        report.append("REPORTE DE DISPONIBILIDAD\n");
        
        try {
            Long count5km = driverRepository.countDriversInRadius(centerLat, centerLon, URBAN_RADIUS);
            Long count12km = driverRepository.countDriversInRadius(centerLat, centerLon, METRO_RADIUS);
            Long count25km = driverRepository.countDriversInRadius(centerLat, centerLon, EXTENDED_RADIUS);
            Long count50km = driverRepository.countDriversInRadius(centerLat, centerLon, MAX_RADIUS);
            
            report.append("Radio 5km: ").append(count5km).append(" conductores\n");
            report.append("Radio 12km: ").append(count12km).append(" conductores\n");
            report.append("Radio 25km: ").append(count25km).append(" conductores\n");
            report.append("Radio 50km: ").append(count50km).append(" conductores\n");
        } catch (Exception e) {
            report.append("Error generando reporte: ").append(e.getMessage());
        }
        
        return report.toString();
    }

    @Override
    public Optional<Driver> getDriverByEmail(String email) {
        System.out.println("Buscando conductor por email: " + email);
        
        if (email == null || email.trim().isEmpty()) {
            System.out.println("Email vacío o nulo");
            return Optional.empty();
        }
        
        return driverRepository.findByUserEmail(email.trim());
    }

    @Override
    public Optional<Driver> getDriverById(Long driverId) {
        System.out.println("Buscando conductor por ID: " + driverId);
        
        if (driverId == null || driverId <= 0) {
            System.out.println("ID de conductor inválido");
            return Optional.empty();
        }
        
        return driverRepository.findById(driverId);
    }

    @Override
    public Driver updateAvailability(String userEmail, boolean available) {
        System.out.println("Actualizando disponibilidad del conductor: " + userEmail + " a " + available);
        
        if (userEmail == null || userEmail.trim().isEmpty()) {
            throw new IllegalArgumentException("Email de usuario requerido");
        }
        
        Optional<Driver> driverOpt = driverRepository.findByUserEmail(userEmail.trim());
        if (driverOpt.isEmpty()) {
            System.out.println("Conductor no encontrado para email: " + userEmail);
            throw new RuntimeException("Conductor no encontrado para email: " + userEmail);
        }
        
        Driver driver = driverOpt.get();
        boolean oldStatus = driver.isAvailable();
        
        if (oldStatus == available) {
            System.out.println("El conductor ya tiene la disponibilidad: " + available);
            return driver;
        }
        
        driver.setAvailable(available);
        Driver updatedDriver = driverRepository.save(driver);
        
        System.out.println("Disponibilidad del conductor " + driver.getId() + 
                         " actualizada: " + oldStatus + " → " + available);
        
        return updatedDriver;
    }

    /**
     * Actualizar ubicación GPS del conductor con validación y cálculo de distancia
     */
    @Override
    public Driver updateLocation(String userEmail, Double latitude, Double longitude) {
        System.out.println("Actualizando ubicación del conductor: " + userEmail);
        
        if (userEmail == null || userEmail.trim().isEmpty()) {
            throw new IllegalArgumentException("Email de usuario requerido");
        }
        
        if (!isValidLocationUpdate(latitude, longitude)) {
            System.out.println("Coordenadas inválidas: " + latitude + ", " + longitude);
            throw new IllegalArgumentException("Coordenadas de ubicación inválidas");
        }
        
        Optional<Driver> driverOpt = driverRepository.findByUserEmail(userEmail.trim());
        if (driverOpt.isEmpty()) {
            System.out.println("Conductor no encontrado para email: " + userEmail);
            throw new RuntimeException("Conductor no encontrado para email: " + userEmail);
        }
        
        Driver driver = driverOpt.get();
        Double oldLat = driver.getCurrentLatitude();
        Double oldLng = driver.getCurrentLongitude();
        
        driver.setCurrentLatitude(latitude);
        driver.setCurrentLongitude(longitude);
        Driver updatedDriver = driverRepository.save(driver);
        
        if (oldLat != null && oldLng != null) {
            double distanceMoved = calculateDistance(oldLat, oldLng, latitude, longitude);
            System.out.println("Ubicación del conductor " + driver.getId() + 
                             " actualizada. Movimiento: " + String.format("%.2f", distanceMoved) + "km");
        } else {
            System.out.println("Primera ubicación del conductor " + driver.getId() + 
                             " establecida: " + latitude + ", " + longitude);
        }
        
        return updatedDriver;
    }

    @Override
    public List<DriverDTO> getAllDrivers() {
        System.out.println("Obteniendo todos los conductores");
        
        List<Driver> drivers = driverRepository.findAll();
        return drivers.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    /**
     * Convertir Driver entity a DTO con datos del usuario relacionado
     */
    @Override
    public DriverDTO convertToDTO(Driver driver) {
        if (driver == null) {
            System.out.println("Intento de convertir conductor nulo a DTO");
            return null;
        }

        try {
            User user = driver.getUser();
            
            DriverDTO dto = new DriverDTO();
            dto.setId(driver.getId());
            dto.setUserId(user.getId());
            dto.setEmail(user.getEmail());
            dto.setFirstName(user.getFirstName());
            dto.setLastName(user.getLastName());
            dto.setPhone(user.getPhone());
            dto.setLicenseNumber(driver.getLicenseNumber());
            dto.setVehiclePlate(driver.getVehiclePlate());
            dto.setVehicleModel(driver.getVehicleModel());
            dto.setVehicleYear(driver.getVehicleYear());
            dto.setAvailable(driver.isAvailable());
            dto.setCurrentLatitude(driver.getCurrentLatitude());
            dto.setCurrentLongitude(driver.getCurrentLongitude());
            
            return dto;
            
        } catch (Exception e) {
            System.out.println("Error convirtiendo Driver a DTO para ID " + 
                             driver.getId() + ": " + e.getMessage());
            throw new RuntimeException("Error convirtiendo datos del conductor", e);
        }
    }

    /**
     * Método de compatibilidad - delega a búsqueda escalonada
     */
    @Override
    public Optional<Driver> findBestAvailableDriver(Double originLat, Double originLon) {
        return findBestAvailableDriverWithEscalation(originLat, originLon);
    }

    /**
     * Método de compatibilidad con radio específico
     */
    @Override
    public Optional<Driver> findBestAvailableDriver(Double originLat, Double originLon, Double radiusKm) {
        if (radiusKm < URBAN_RADIUS) {
            return findBestAvailableDriverWithEscalation(originLat, originLon);
        }
        return findDriverInRadius(originLat, originLon, radiusKm);
    }

    /**
     * Buscar conductor más cercano en radio específico con query optimizada y fallback
     */
    private Optional<Driver> findDriverInRadius(Double originLat, Double originLon, Double radiusKm) {
        try {
            Optional<Driver> closestDriver = driverRepository.findClosestAvailableDriver(
                originLat, originLon, radiusKm);
            
            if (closestDriver.isPresent()) {
                Driver driver = closestDriver.get();
                if (isValidDriverForAssignment(driver)) {
                    return closestDriver;
                }
            }
            
            List<Driver> driversInRadius = driverRepository.findNearbyDriversWithDistance(
                originLat, originLon, radiusKm);
            
            return driversInRadius.stream()
                    .filter(this::isValidDriverForAssignment)
                    .findFirst();
                    
        } catch (Exception e) {
            System.out.println("Error en búsqueda optimizada, usando fallback");
            return findDriversInSquareAreaOptional(originLat, originLon, radiusKm);
        }
    }

    /**
     * Búsqueda por área cuadrada como fallback cuando falla búsqueda por radio
     */
    private List<Driver> findDriversInSquareArea(Double originLat, Double originLon, Double radiusKm) {
        double latDelta = radiusKm / 111.0;
        double lonDelta = radiusKm / (111.0 * Math.cos(Math.toRadians(originLat)));
        
        return driverRepository.findNearbyDriversSimple(
                originLat - latDelta, originLat + latDelta,
                originLon - lonDelta, originLon + lonDelta);
    }

    /**
     * Encontrar conductor más cercano en área cuadrada calculando distancia real
     */
    private Optional<Driver> findDriversInSquareAreaOptional(Double originLat, Double originLon, Double radiusKm) {
        List<Driver> drivers = findDriversInSquareArea(originLat, originLon, radiusKm);
        
        Driver closestDriver = null;
        double minDistance = Double.MAX_VALUE;
        
        for (Driver driver : drivers) {
            if (isValidDriverForAssignment(driver)) {
                double distance = calculateDistance(
                    originLat, originLon, 
                    driver.getCurrentLatitude(), 
                    driver.getCurrentLongitude()
                );
                
                if (distance <= radiusKm && distance < minDistance) {
                    minDistance = distance;
                    closestDriver = driver;
                }
            }
        }
        
        return Optional.ofNullable(closestDriver);
    }

    /**
     * Validar que conductor cumple requisitos para asignación de viaje
     */
    private boolean isValidDriverForAssignment(Driver driver) {
        return driver.isAvailable() && 
               driver.hasValidLocation() && 
               isValidCoordinate(driver.getCurrentLatitude(), driver.getCurrentLongitude()) &&
               driver.getUser() != null &&
               driver.getVehicleModel() != null && 
               driver.getVehiclePlate() != null;
    }

    /**
     * Validar coordenadas geográficas excluyendo punto cero
     */
    private boolean isValidCoordinate(Double lat, Double lon) {
        return lat != null && lon != null && 
               lat >= -90 && lat <= 90 && 
               lon >= -180 && lon <= 180 &&
               !(lat == 0.0 && lon == 0.0);
    }

    /**
     * Validar coordenadas para actualización de ubicación
     */
    private boolean isValidLocationUpdate(Double latitude, Double longitude) {
        if (latitude == null || longitude == null) {
            return false;
        }
        
        return latitude >= -90 && latitude <= 90 && 
               longitude >= -180 && longitude <= 180 &&
               !(latitude == 0.0 && longitude == 0.0);
    }
}
