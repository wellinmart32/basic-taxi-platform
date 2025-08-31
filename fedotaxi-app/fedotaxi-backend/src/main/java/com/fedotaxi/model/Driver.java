package com.fedotaxi.model;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "drivers")
public class Driver {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    // Relación hacia User con cascade para operaciones automáticas
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    
    @Column(nullable = false)
    private String licenseNumber;
    
    @Column(nullable = false)
    private String vehiclePlate;
    
    private String vehicleModel;
    
    private String vehicleYear;
    
    private boolean available = false;
    
    @Column(nullable = true)
    private Double currentLatitude;
    
    @Column(nullable = true)
    private Double currentLongitude;
    
    /**
     * Verificar si el conductor tiene ubicación válida
     */
    public boolean hasValidLocation() {
        return currentLatitude != null && currentLongitude != null;
    }
    
    /**
     * Verificar si el conductor está disponible para viajes
     */
    public boolean isAvailableForTrips() {
        return available && hasValidLocation();
    }
}
