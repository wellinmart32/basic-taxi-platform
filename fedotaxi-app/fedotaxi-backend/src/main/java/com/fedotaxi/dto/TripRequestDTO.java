package com.fedotaxi.dto;

import lombok.Data;

@Data
public class TripRequestDTO {
    
    // Coordenadas del viaje
    private Double originLatitude;
    private Double originLongitude;
    private Double destinationLatitude;
    private Double destinationLongitude;
    
    // Direcciones del viaje
    private String originAddress;
    private String destinationAddress;
}
