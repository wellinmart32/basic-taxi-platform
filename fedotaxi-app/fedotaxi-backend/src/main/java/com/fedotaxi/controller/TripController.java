package com.fedotaxi.controller;

import com.fedotaxi.dto.TripRequestDTO;
import com.fedotaxi.dto.TripResponseDTO;
import com.fedotaxi.dto.TripUpdateDTO;
import com.fedotaxi.model.Driver;
import com.fedotaxi.model.Trip;
import com.fedotaxi.model.User;
import com.fedotaxi.service.interfaces.TripService;
import com.fedotaxi.service.interfaces.UserService;
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
@RequestMapping("/api/trips")
public class TripController {

    @Autowired
    private TripService tripService;
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private DriverService driverService;

    /**
     * Solicitar un nuevo viaje (solo pasajeros)
     */
    @PostMapping("/request")
    @PreAuthorize("hasRole('ROLE_PASSENGER')")
    public ResponseEntity<?> requestTrip(@RequestBody TripRequestDTO tripRequestDTO) {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();

            System.out.println("🚖 Nueva solicitud de viaje: " + userEmail);
            System.out.println("📍 Origen: " + tripRequestDTO.getOriginAddress());
            System.out.println("📍 Destino: " + tripRequestDTO.getDestinationAddress());

            Optional<User> passengerOpt = userService.getUserByEmail(userEmail);
            if (passengerOpt.isEmpty()) {
                System.out.println("❌ Usuario no encontrado: " + userEmail);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Usuario no encontrado");
            }

            User passenger = passengerOpt.get();

            // Verificar viajes activos
            if (tripService.hasActiveTrips(passenger)) {
                System.out.println("⚠️ Pasajero ya tiene viajes activos");
                return ResponseEntity.badRequest().body("Ya tienes un viaje activo");
            }

            // Crear viaje
            Trip trip = tripService.createTrip(passenger, tripRequestDTO);
            TripResponseDTO responseDTO = tripService.convertToDTO(trip, tripRequestDTO);

            System.out.println("✅ Viaje creado: #" + trip.getId());
            return ResponseEntity.ok(responseDTO);

        } catch (RuntimeException e) {
            System.out.println("❌ Error de negocio: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage());
        } catch (Exception e) {
            System.out.println("❌ Error interno: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error interno del servidor: " + e.getMessage());
        }
    }

    /**
     * Actualizar estado de un viaje
     */
    @PutMapping("/{tripId}/status")
    @PreAuthorize("hasRole('ROLE_DRIVER') or hasRole('ROLE_PASSENGER')")
    public ResponseEntity<?> updateTripStatus(
            @PathVariable Long tripId,
            @RequestBody TripUpdateDTO tripUpdateDTO) {
        
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();
            
            System.out.println("🔄 Actualizando viaje #" + tripId + 
                              " a " + tripUpdateDTO.getStatus() + " por " + userEmail);
            
            // Obtener usuario actual
            Optional<User> userOpt = userService.getUserByEmail(userEmail);
            if (userOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Usuario no encontrado");
            }
            
            // Actualizar estado
            Trip updatedTrip = tripService.updateTripStatus(tripId, tripUpdateDTO.getStatus());
            TripResponseDTO responseDTO = tripService.convertToDTO(updatedTrip, null);
            
            System.out.println("✅ Estado del viaje actualizado");
            return ResponseEntity.ok(responseDTO);
            
        } catch (RuntimeException e) {
            System.out.println("❌ Error de negocio actualizando estado: " + e.getMessage());
            return ResponseEntity.badRequest().body(e.getMessage());
        } catch (Exception e) {
            System.out.println("❌ Error interno actualizando estado: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error actualizando estado del viaje: " + e.getMessage());
        }
    }
    
    /**
     * Obtener mis viajes (conductor o pasajero)
     */
    @GetMapping("/my-trips")
    @PreAuthorize("hasRole('ROLE_DRIVER') or hasRole('ROLE_PASSENGER')")
    public ResponseEntity<?> getMyTrips() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();
            
            Optional<User> userOpt = userService.getUserByEmail(userEmail);
            if (userOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Usuario no encontrado");
            }
            
            User user = userOpt.get();
            List<Trip> trips;
            
            switch (user.getRole()) {
                case PASSENGER:
                    trips = tripService.getTripsByPassenger(user);
                    break;
                case DRIVER:
                    Optional<Driver> driverOpt = driverService.getDriverByEmail(userEmail);
                    if (driverOpt.isEmpty()) {
                        return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Conductor no encontrado");
                    }
                    trips = tripService.getTripsByDriver(driverOpt.get());
                    break;
                default:
                    return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Rol no autorizado");
            }
            
            List<TripResponseDTO> tripDTOs = trips.stream()
                    .map(trip -> tripService.convertToDTO(trip, null))
                    .toList();
            
            System.out.println("✅ Obtenidos " + trips.size() + " viajes para: " + userEmail);
            return ResponseEntity.ok(tripDTOs);
            
        } catch (Exception e) {
            System.out.println("❌ Error obteniendo mis viajes: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error obteniendo viajes: " + e.getMessage());
        }
    }
    
    /**
     * Obtener viajes activos (solo conductores)
     */
    @GetMapping("/active")
    @PreAuthorize("hasRole('ROLE_DRIVER')")
    public ResponseEntity<?> getActiveTrips() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();
            
            Optional<Driver> driverOpt = driverService.getDriverByEmail(userEmail);
            if (driverOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Conductor no encontrado");
            }
            
            Driver driver = driverOpt.get();
            List<Trip> activeTrips = tripService.getActiveTripsForDriver(driver);
            
            List<TripResponseDTO> tripDTOs = activeTrips.stream()
                    .map(trip -> tripService.convertToDTO(trip, null))
                    .toList();
            
            System.out.println("✅ Obtenidos " + activeTrips.size() + " viajes activos para conductor: " + driver.getId());
            return ResponseEntity.ok(tripDTOs);
            
        } catch (Exception e) {
            System.out.println("❌ Error obteniendo viajes activos: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error obteniendo viajes activos: " + e.getMessage());
        }
    }
    
    /**
     * Obtener viaje específico por ID
     */
    @GetMapping("/{tripId}")
    @PreAuthorize("hasRole('ROLE_DRIVER') or hasRole('ROLE_PASSENGER')")
    public ResponseEntity<?> getTripById(@PathVariable Long tripId) {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();
            
            Optional<User> userOpt = userService.getUserByEmail(userEmail);
            if (userOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Usuario no encontrado");
            }
            
            Optional<Trip> tripOpt = tripService.getTripById(tripId);
            if (tripOpt.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Viaje no encontrado");
            }
            
            Trip trip = tripOpt.get();
            User user = userOpt.get();
            
            // Verificar permisos
            if (!user.getId().equals(trip.getPassenger().getId()) && 
                !user.getId().equals(trip.getDriver().getUser().getId())) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN).body("No tienes permiso para ver este viaje");
            }
            
            TripResponseDTO responseDTO = tripService.convertToDTO(trip, null);
            System.out.println("✅ Viaje obtenido por ID: " + tripId);
            return ResponseEntity.ok(responseDTO);
            
        } catch (Exception e) {
            System.out.println("❌ Error obteniendo viaje por ID " + tripId + ": " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error obteniendo viaje: " + e.getMessage());
        }
    }
}
