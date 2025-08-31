package com.fedotaxi.dto;

import com.fedotaxi.model.UserRole;
import lombok.Data;

@Data
public class UserDTO {
    private Long id;
    private String email;
    private String firstName;
    private String lastName;
    private String phone;
    private UserRole role;
    private boolean active;
}
