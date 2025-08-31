package com.fedotaxi.dto;

import com.fedotaxi.model.TripStatus;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TripResponseDTO {
    
    // Identificadores
    private Long id;
    private Long passengerId;
    private String passengerName;
    private Long driverId;
    private String driverName;
    private String driverPhone;
    
    // Información del vehículo
    private String vehiclePlate;
    private String vehicleModel;
    
    // Direcciones
    private String originAddress;
    private String destinationAddress;
    
    // Coordenadas
    private Double originLatitude;
    private Double originLongitude;
    private Double destinationLatitude;
    private Double destinationLongitude;
    
    // Timestamps del ciclo de vida del viaje
    private LocalDateTime requestTime;
    private LocalDateTime acceptTime;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    
    // Datos del viaje
    private Double distance;
    private Double fare;
    private TripStatus status;
}
