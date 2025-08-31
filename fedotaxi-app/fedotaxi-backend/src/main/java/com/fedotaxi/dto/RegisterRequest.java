package com.fedotaxi.dto;

import com.fedotaxi.model.UserRole;
import lombok.Data;

@Data
public class RegisterRequest {
    private String email;
    private String password;
    private String firstName;
    private String lastName;
    private String phone;
    private UserRole role;
    
    // Campos específicos para conductores
    private String licenseNumber;
    private String vehiclePlate;
    private String vehicleModel;
    private String vehicleYear;
}
