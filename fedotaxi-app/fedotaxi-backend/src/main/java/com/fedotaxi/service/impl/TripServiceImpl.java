package com.fedotaxi.service.impl;

import com.fedotaxi.dto.TripRequestDTO;
import com.fedotaxi.dto.TripResponseDTO;
import com.fedotaxi.model.Driver;
import com.fedotaxi.model.Trip;
import com.fedotaxi.model.TripStatus;
import com.fedotaxi.model.User;
import com.fedotaxi.repository.DriverRepository;
import com.fedotaxi.repository.TripRepository;
import com.fedotaxi.service.interfaces.DriverService;
import com.fedotaxi.service.interfaces.TripService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class TripServiceImpl implements TripService {
    
    @Autowired
    private TripRepository tripRepository;
    
    @Autowired
    private DriverRepository driverRepository;
    
    @Autowired
    private DriverService driverService;

    @Override
    public Trip createTrip(User passenger, TripRequestDTO tripRequestDTO) {
        System.out.println("Creando viaje para pasajero ID: " + passenger.getId());
        
        validateTripRequest(tripRequestDTO);
        
        if (hasActiveTrips(passenger)) {
            System.out.println("El pasajero ya tiene viajes activos");
            throw new RuntimeException("Ya tienes un viaje activo");
        }
        
        System.out.println("Buscando conductor disponible...");
        Optional<Driver> bestDriverOpt = driverService.findBestAvailableDriverWithEscalation(
                tripRequestDTO.getOriginLatitude(),
                tripRequestDTO.getOriginLongitude()
        );
        
        if (bestDriverOpt.isEmpty()) {
            System.out.println("No hay conductores disponibles");
            
            String availabilityReport = driverService.getZoneAvailabilityReport(
                tripRequestDTO.getOriginLatitude(), 
                tripRequestDTO.getOriginLongitude()
            );
            System.out.println(availabilityReport);
            
            throw new RuntimeException("No hay conductores disponibles en un radio de 50km. Intenta más tarde.");
        }

        Driver driver = bestDriverOpt.get();
        System.out.println("Conductor asignado: " + driver.getId() + 
                          " (" + driver.getUser().getFirstName() + " " + driver.getUser().getLastName() + ")");

        Trip trip = new Trip();
        trip.setPassenger(passenger);
        trip.setDriver(driver);
        
        trip.setOriginLatitude(tripRequestDTO.getOriginLatitude());
        trip.setOriginLongitude(tripRequestDTO.getOriginLongitude());
        trip.setDestinationLatitude(tripRequestDTO.getDestinationLatitude());
        trip.setDestinationLongitude(tripRequestDTO.getDestinationLongitude());
        
        LocalDateTime now = LocalDateTime.now();
        trip.setStartTime(now);
        trip.setStatus(TripStatus.REQUESTED);

        double estimatedDistance = calculateDistance(
            tripRequestDTO.getOriginLatitude(), tripRequestDTO.getOriginLongitude(),
            tripRequestDTO.getDestinationLatitude(), tripRequestDTO.getDestinationLongitude()
        );
        trip.setDistance(estimatedDistance);
        trip.setFare(calculateFare(estimatedDistance));

        driver.setAvailable(false);
        driverRepository.save(driver);
        System.out.println("Conductor " + driver.getId() + " marcado como no disponible");

        Trip savedTrip = tripRepository.save(trip);
        System.out.println("Viaje creado exitosamente: #" + savedTrip.getId());

        return savedTrip;
    }

    @Override
    public Trip updateTripStatus(Long tripId, TripStatus newStatus) {
        System.out.println("Actualizando viaje #" + tripId + " a estado " + newStatus);
        
        if (tripId == null || tripId <= 0) {
            throw new IllegalArgumentException("ID de viaje inválido");
        }
        
        Optional<Trip> tripOpt = tripRepository.findById(tripId);
        if (tripOpt.isEmpty()) {
            System.out.println("Viaje no encontrado: " + tripId);
            throw new RuntimeException("Viaje no encontrado");
        }
        
        Trip trip = tripOpt.get();
        TripStatus currentStatus = trip.getStatus();
        
        if (!isValidStatusTransition(currentStatus, newStatus)) {
            System.out.println("Transición inválida: " + currentStatus + " -> " + newStatus);
            throw new IllegalArgumentException("Transición de estado inválida: " + currentStatus + " -> " + newStatus);
        }
        
        LocalDateTime now = LocalDateTime.now();
        trip.setStatus(newStatus);
        
        switch (newStatus) {
            case ACCEPTED:
                System.out.println("Viaje aceptado por conductor");
                break;
                
            case IN_PROGRESS:
                trip.setStartTime(now);
                System.out.println("Viaje iniciado");
                break;
                
            case COMPLETED:
                trip.setEndTime(now);
                
                double distance = calculateDistance(
                        trip.getOriginLatitude(), trip.getOriginLongitude(),
                        trip.getDestinationLatitude(), trip.getDestinationLongitude()
                );
                trip.setDistance(distance);
                trip.setFare(calculateFare(distance));
                
                Driver driver = trip.getDriver();
                driver.setAvailable(true);
                driverRepository.save(driver);
                
                System.out.println("Viaje completado - conductor " + driver.getId() + " disponible");
                break;
                
            case CANCELLED:
                trip.setEndTime(now);
                
                Driver driver2 = trip.getDriver();
                driver2.setAvailable(true);
                driverRepository.save(driver2);
                
                System.out.println("Viaje cancelado - conductor " + driver2.getId() + " liberado");
                break;
        }
        
        return tripRepository.save(trip);
    }

    @Override
    public List<Trip> getTripsByPassenger(User passenger) {
        System.out.println("Obteniendo viajes del pasajero: " + passenger.getId());
        
        if (passenger == null) {
            throw new IllegalArgumentException("Pasajero no puede ser nulo");
        }
        
        return tripRepository.findByPassenger(passenger);
    }

    @Override
    public List<Trip> getTripsByDriver(Driver driver) {
        System.out.println("Obteniendo viajes del conductor: " + driver.getId());
        
        if (driver == null) {
            throw new IllegalArgumentException("Conductor no puede ser nulo");
        }
        
        return tripRepository.findByDriver(driver);
    }

    @Override
    public List<Trip> getActiveTripsForPassenger(User passenger) {
        System.out.println("Obteniendo viajes activos del pasajero: " + passenger.getId());
        
        if (passenger == null) {
            throw new IllegalArgumentException("Pasajero no puede ser nulo");
        }
        
        List<Trip> activeTrips = tripRepository.findByPassengerAndStatus(passenger, TripStatus.REQUESTED);
        activeTrips.addAll(tripRepository.findByPassengerAndStatus(passenger, TripStatus.ACCEPTED));
        activeTrips.addAll(tripRepository.findByPassengerAndStatus(passenger, TripStatus.IN_PROGRESS));
        
        System.out.println("Pasajero " + passenger.getId() + " tiene " + activeTrips.size() + " viajes activos");
        return activeTrips;
    }

    @Override
    public List<Trip> getActiveTripsForDriver(Driver driver) {
        System.out.println("Obteniendo viajes activos del conductor: " + driver.getId());
        
        if (driver == null) {
            throw new IllegalArgumentException("Conductor no puede ser nulo");
        }
        
        List<Trip> activeTrips = tripRepository.findByDriverAndStatus(driver, TripStatus.REQUESTED);
        activeTrips.addAll(tripRepository.findByDriverAndStatus(driver, TripStatus.ACCEPTED));
        activeTrips.addAll(tripRepository.findByDriverAndStatus(driver, TripStatus.IN_PROGRESS));
        
        System.out.println("Conductor " + driver.getId() + " tiene " + activeTrips.size() + " viajes activos");
        return activeTrips;
    }

    @Override
    public boolean hasActiveTrips(User passenger) {
        if (passenger == null) {
            return false;
        }
        
        List<Trip> activeTrips = getActiveTripsForPassenger(passenger);
        return !activeTrips.isEmpty();
    }

    @Override
    public boolean hasActiveTripsDriver(Driver driver) {
        if (driver == null) {
            return false;
        }
        
        List<Trip> activeTrips = getActiveTripsForDriver(driver);
        return !activeTrips.isEmpty();
    }

    @Override
    public Optional<Trip> getTripById(Long tripId) {
        System.out.println("Buscando viaje por ID: " + tripId);
        
        if (tripId == null || tripId <= 0) {
            System.out.println("ID de viaje inválido");
            return Optional.empty();
        }
        
        return tripRepository.findById(tripId);
    }

    @Override
    public Trip cancelTrip(Long tripId, String reason) {
        System.out.println("Cancelando viaje #" + tripId + ". Razón: " + reason);
        
        Trip trip = updateTripStatus(tripId, TripStatus.CANCELLED);
        System.out.println("Viaje " + tripId + " cancelado exitosamente");
        
        return trip;
    }

    @Override
    public Trip completeTrip(Long tripId) {
        System.out.println("Completando viaje #" + tripId);
        
        Trip trip = updateTripStatus(tripId, TripStatus.COMPLETED);
        
        if (trip.getDistance() == null || trip.getFare() == null) {
            double distance = calculateDistance(
                trip.getOriginLatitude(), trip.getOriginLongitude(),
                trip.getDestinationLatitude(), trip.getDestinationLongitude()
            );
            trip.setDistance(distance);
            trip.setFare(calculateFare(distance));
            trip = tripRepository.save(trip);
        }
        
        System.out.println("Viaje " + tripId + " completado exitosamente");
        return trip;
    }

    @Override
    public double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        return driverService.calculateDistance(lat1, lon1, lat2, lon2);
    }

    /**
     * Calcular tarifa base más costo por kilómetro recorrido
     */
    @Override
    public double calculateFare(double distance) {
        double baseFare = 2.50;
        double perKmRate = 0.80;
        
        double fare = baseFare + (distance * perKmRate);
        System.out.println("Tarifa calculada: $" + String.format("%.2f", fare) + 
                          " (Distancia: " + String.format("%.2f", distance) + "km)");
        
        return fare;
    }

    /**
     * Generar estadísticas de viajes para un usuario específico
     */
    @Override
    public TripStatistics getTripStatistics(User user) {
        System.out.println("Generando estadísticas para usuario: " + user.getId());
        
        if (user == null) {
            throw new IllegalArgumentException("Usuario no puede ser nulo");
        }
        
        List<Trip> allTrips = tripRepository.findByPassenger(user);
        
        long totalTrips = allTrips.size();
        long completedTrips = allTrips.stream()
            .filter(trip -> trip.getStatus() == TripStatus.COMPLETED)
            .count();
        
        double totalDistance = allTrips.stream()
            .filter(trip -> trip.getDistance() != null)
            .mapToDouble(Trip::getDistance)
            .sum();
            
        double totalFare = allTrips.stream()
            .filter(trip -> trip.getFare() != null)
            .mapToDouble(Trip::getFare)
            .sum();
        
        TripStatistics stats = new TripStatistics(totalTrips, completedTrips, totalDistance, totalFare);
        System.out.println("Estadísticas generadas: " + totalTrips + " viajes, " + 
                          completedTrips + " completados");
        
        return stats;
    }

    /**
     * Convertir Trip entity a DTO con datos completos del viaje
     */
    @Override
    public TripResponseDTO convertToDTO(Trip trip, TripRequestDTO originalRequest) {
        if (trip == null) {
            System.out.println("Intento de convertir viaje nulo a DTO");
            return null;
        }

        try {
            TripResponseDTO dto = new TripResponseDTO();
            dto.setId(trip.getId());
            dto.setPassengerId(trip.getPassenger().getId());
            
            dto.setPassengerName(trip.getPassenger().getFirstName() + " " + trip.getPassenger().getLastName());
            
            dto.setDriverId(trip.getDriver().getUser().getId());
            
            dto.setDriverName(trip.getDriver().getUser().getFirstName() + " " + trip.getDriver().getUser().getLastName());
            
            dto.setDriverPhone(trip.getDriver().getUser().getPhone());
            dto.setVehiclePlate(trip.getDriver().getVehiclePlate());
            dto.setVehicleModel(trip.getDriver().getVehicleModel());
            
            if (originalRequest != null) {
                dto.setOriginAddress(originalRequest.getOriginAddress());
                dto.setDestinationAddress(originalRequest.getDestinationAddress());
            } else {
                dto.setOriginAddress("Ubicación de origen");
                dto.setDestinationAddress("Ubicación de destino");
            }
            
            dto.setOriginLatitude(trip.getOriginLatitude());
            dto.setOriginLongitude(trip.getOriginLongitude());
            dto.setDestinationLatitude(trip.getDestinationLatitude());
            dto.setDestinationLongitude(trip.getDestinationLongitude());
            
            dto.setRequestTime(trip.getStartTime());
            dto.setAcceptTime(null); // TODO: Agregar campo a entidad Trip
            dto.setStartTime(trip.getStartTime());
            dto.setEndTime(trip.getEndTime());
            
            dto.setDistance(trip.getDistance());
            dto.setFare(trip.getFare());
            dto.setStatus(trip.getStatus());
            
            return dto;
            
        } catch (Exception e) {
            System.out.println("Error convirtiendo Trip a DTO para ID " + 
                             trip.getId() + ": " + e.getMessage());
            throw new RuntimeException("Error convirtiendo datos del viaje", e);
        }
    }

    /**
     * Validar datos requeridos del request de viaje
     */
    private void validateTripRequest(TripRequestDTO tripRequestDTO) {
        if (tripRequestDTO == null) {
            throw new IllegalArgumentException("Datos del viaje no pueden ser nulos");
        }

        if (!isValidCoordinates(tripRequestDTO.getOriginLatitude(), tripRequestDTO.getOriginLongitude()) ||
            !isValidCoordinates(tripRequestDTO.getDestinationLatitude(), tripRequestDTO.getDestinationLongitude())) {
            System.out.println("Coordenadas inválidas");
            throw new IllegalArgumentException("Coordenadas inválidas");
        }

        if (tripRequestDTO.getOriginAddress() == null || tripRequestDTO.getOriginAddress().trim().isEmpty() ||
            tripRequestDTO.getDestinationAddress() == null || tripRequestDTO.getDestinationAddress().trim().isEmpty()) {
            System.out.println("Direcciones faltantes o vacías");
            throw new IllegalArgumentException("Direcciones de origen y destino son requeridas");
        }

        double distance = calculateDistance(
            tripRequestDTO.getOriginLatitude(), tripRequestDTO.getOriginLongitude(),
            tripRequestDTO.getDestinationLatitude(), tripRequestDTO.getDestinationLongitude()
        );

        if (distance < 0.1) {
            System.out.println("Origen y destino muy cercanos: " + distance + "km");
            throw new IllegalArgumentException("El origen y destino están muy cerca");
        }

        if (!isInEcuador(tripRequestDTO.getOriginLatitude(), tripRequestDTO.getOriginLongitude()) ||
            !isInEcuador(tripRequestDTO.getDestinationLatitude(), tripRequestDTO.getDestinationLongitude())) {
            System.out.println("Advertencia: Viaje fuera de Ecuador detectado");
        }
    }

    /**
     * Verificar que las coordenadas estén en rango válido y no sean punto cero
     */
    private boolean isValidCoordinates(Double latitude, Double longitude) {
        return latitude != null && longitude != null && 
               latitude >= -90 && latitude <= 90 && 
               longitude >= -180 && longitude <= 180 &&
               !(latitude == 0.0 && longitude == 0.0);
    }

    /**
     * Verificar si las coordenadas están dentro de Ecuador
     */
    private boolean isInEcuador(Double latitude, Double longitude) {
        return latitude >= -5.0 && latitude <= 2.0 && 
               longitude >= -92.0 && longitude <= -75.0;
    }

    /**
     * Validar transiciones permitidas entre estados de viaje
     */
    private boolean isValidStatusTransition(TripStatus currentStatus, TripStatus newStatus) {
        if (currentStatus == newStatus) {
            return false;
        }
        
        switch (currentStatus) {
            case REQUESTED:
                return newStatus == TripStatus.ACCEPTED || newStatus == TripStatus.CANCELLED;
                
            case ACCEPTED:
                return newStatus == TripStatus.IN_PROGRESS || newStatus == TripStatus.CANCELLED;
                
            case IN_PROGRESS:
                return newStatus == TripStatus.COMPLETED || newStatus == TripStatus.CANCELLED;
                
            case COMPLETED:
            case CANCELLED:
                return false;
                
            default:
                return false;
        }
    }
}
