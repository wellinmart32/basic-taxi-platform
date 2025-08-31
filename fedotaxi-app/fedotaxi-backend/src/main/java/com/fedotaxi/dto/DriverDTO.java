package com.fedotaxi.dto;

import lombok.Data;

@Data
public class DriverDTO {
    private Long id;
    private Long userId;
    private String email;
    private String firstName;
    private String lastName;
    private String phone;
    private String licenseNumber;
    private String vehiclePlate;
    private String vehicleModel;
    private String vehicleYear;
    private boolean available;
    private Double currentLatitude;
    private Double currentLongitude;
}
