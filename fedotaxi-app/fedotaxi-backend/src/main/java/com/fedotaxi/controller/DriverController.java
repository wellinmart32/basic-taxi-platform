package com.fedotaxi.controller;

import com.fedotaxi.dto.DriverDTO;
import com.fedotaxi.dto.DriverLocationDTO;
import com.fedotaxi.dto.DriverStatusDTO;
import com.fedotaxi.model.Driver;
import com.fedotaxi.service.interfaces.DriverService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/drivers")
public class DriverController {

    @Autowired
    private DriverService driverService;

    /**
     * Obtener todos los conductores (solo admin)
     */
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<?> getAllDrivers() {
        try {
            List<DriverDTO> drivers = driverService.getAllDrivers();
            System.out.println("✅ Admin obtuvo " + drivers.size() + " conductores");
            return ResponseEntity.ok(drivers);
        } catch (Exception e) {
            System.out.println("❌ Error en getAllDrivers: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error obteniendo conductores: " + e.getMessage());
        }
    }

    /**
     * Obtener información del conductor actual
     */
    @GetMapping("/me")
    @PreAuthorize("hasRole('DRIVER')")
    public ResponseEntity<?> getCurrentDriver() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();
            
            Optional<Driver> driverOpt = driverService.getDriverByEmail(userEmail);
            if (driverOpt.isEmpty()) {
                System.out.println("❌ Conductor no encontrado: " + userEmail);
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body("Conductor no encontrado para email: " + userEmail);
            }
            
            DriverDTO driverDTO = driverService.convertToDTO(driverOpt.get());
            System.out.println("✅ Información del conductor obtenida: " + driverOpt.get().getId());
            return ResponseEntity.ok(driverDTO);
            
        } catch (Exception e) {
            System.out.println("❌ Error en getCurrentDriver: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error interno del servidor: " + e.getMessage());
        }
    }

    /**
     * Actualizar estado de disponibilidad del conductor
     */
    @PutMapping("/status")
    @PreAuthorize("hasRole('DRIVER')")
    public ResponseEntity<?> updateDriverStatus(@RequestBody DriverStatusDTO statusDTO) {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();
            
            Driver updatedDriver = driverService.updateAvailability(userEmail, statusDTO.isAvailable());
            DriverDTO driverDTO = driverService.convertToDTO(updatedDriver);
            
            System.out.println("🔄 Estado del conductor " + updatedDriver.getId() + 
                             " cambiado a: " + statusDTO.isAvailable());
            
            return ResponseEntity.ok(driverDTO);
            
        } catch (RuntimeException e) {
            System.out.println("❌ Error de negocio actualizando estado: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage());
        } catch (Exception e) {
            System.out.println("❌ Error interno actualizando estado: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error actualizando disponibilidad: " + e.getMessage());
        }
    }

    /**
     * Actualizar ubicación del conductor
     */
    @PutMapping("/location")
    @PreAuthorize("hasRole('DRIVER')")
    public ResponseEntity<?> updateDriverLocation(@RequestBody DriverLocationDTO locationDTO) {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();
            
            Driver updatedDriver = driverService.updateLocation(userEmail, 
                    locationDTO.getLatitude(), locationDTO.getLongitude());
            DriverDTO driverDTO = driverService.convertToDTO(updatedDriver);
            
            System.out.println("📍 Ubicación del conductor " + updatedDriver.getId() + 
                             " actualizada: " + locationDTO.getLatitude() + ", " + locationDTO.getLongitude());
            
            return ResponseEntity.ok(driverDTO);
            
        } catch (RuntimeException e) {
            System.out.println("❌ Error de negocio actualizando ubicación: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage());
        } catch (Exception e) {
            System.out.println("❌ Error interno actualizando ubicación: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error actualizando ubicación: " + e.getMessage());
        }
    }

    /**
     * Buscar conductores cercanos a una ubicación
     */
    @GetMapping("/nearby")
    public ResponseEntity<?> getNearbyDrivers(
            @RequestParam Double latitude,
            @RequestParam Double longitude,
            @RequestParam(defaultValue = "25.0") Double radius) {

        System.out.println("🔍 Búsqueda de conductores: " + 
                          latitude + ", " + longitude + " (radio: " + radius + "km)");

        try {
            List<Driver> nearbyDrivers = driverService.findNearbyDrivers(latitude, longitude, radius);
            
            List<DriverDTO> driverDTOs = nearbyDrivers.stream()
                    .map(driverService::convertToDTO)
                    .toList();

            System.out.println("✅ Encontrados " + nearbyDrivers.size() + 
                             " conductores en radio de " + radius + "km");

            return ResponseEntity.ok(driverDTOs);
            
        } catch (IllegalArgumentException e) {
            System.out.println("❌ Parámetros de búsqueda inválidos: " + e.getMessage());
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            System.out.println("❌ Error en búsqueda de conductores: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error en búsqueda de conductores");
        }
    }

    /**
     * Obtener conductor por ID
     */
    @GetMapping("/{driverId}")
    public ResponseEntity<?> getDriverById(@PathVariable Long driverId) {
        try {
            Optional<Driver> driverOpt = driverService.getDriverById(driverId);
            if (driverOpt.isEmpty()) {
                System.out.println("❌ Conductor no encontrado por ID: " + driverId);
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body("Conductor no encontrado");
            }
            
            DriverDTO driverDTO = driverService.convertToDTO(driverOpt.get());
            System.out.println("✅ Conductor obtenido por ID: " + driverId);
            return ResponseEntity.ok(driverDTO);
            
        } catch (Exception e) {
            System.out.println("❌ Error obteniendo conductor por ID " + driverId + ": " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error obteniendo conductor: " + e.getMessage());
        }
    }
}
