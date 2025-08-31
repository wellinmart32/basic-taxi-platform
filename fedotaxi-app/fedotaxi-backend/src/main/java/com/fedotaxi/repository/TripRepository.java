package com.fedotaxi.repository;

import com.fedotaxi.model.Driver;
import com.fedotaxi.model.Trip;
import com.fedotaxi.model.TripStatus;
import com.fedotaxi.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface TripRepository extends JpaRepository<Trip, Long> {
    
    /**
     * Buscar viajes por pasajero
     */
    List<Trip> findByPassenger(User passenger);
    
    /**
     * Buscar viajes por conductor
     */
    List<Trip> findByDriver(Driver driver);
    
    /**
     * Buscar viajes por estado
     */
    List<Trip> findByStatus(TripStatus status);
    
    /**
     * Buscar viajes en un rango de fechas
     */
    List<Trip> findByStartTimeBetween(LocalDateTime start, LocalDateTime end);
    
    /**
     * Buscar viajes de un pasajero por estado
     */
    List<Trip> findByPassengerAndStatus(User passenger, TripStatus status);
    
    /**
     * Buscar viajes de un conductor por estado
     */
    List<Trip> findByDriverAndStatus(Driver driver, TripStatus status);
}
