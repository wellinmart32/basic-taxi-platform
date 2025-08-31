package com.fedotaxi.dto;

import lombok.Data;

@Data
public class UserUpdateDTO {
    private String firstName;
    private String lastName;
    private String phone;
    private String password;
}
