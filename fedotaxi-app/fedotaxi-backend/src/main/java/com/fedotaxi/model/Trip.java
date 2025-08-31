package com.fedotaxi.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "trips")
public class Trip {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne
    @JoinColumn(name = "passenger_id", nullable = false)
    private User passenger;
    
    @ManyToOne
    @JoinColumn(name = "driver_id", nullable = false)
    private Driver driver;
    
    @Column(nullable = false)
    private Double originLatitude;
    
    @Column(nullable = false)
    private Double originLongitude;
    
    @Column(nullable = false)
    private Double destinationLatitude;
    
    @Column(nullable = false)
    private Double destinationLongitude;
    
    @Column(nullable = false)
    private LocalDateTime startTime;
    
    private LocalDateTime endTime;
    
    private Double distance;
    
    private Double fare;
    
    @Enumerated(EnumType.STRING)
    private TripStatus status;
}
