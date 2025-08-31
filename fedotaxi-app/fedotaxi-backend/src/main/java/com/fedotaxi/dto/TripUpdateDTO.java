package com.fedotaxi.dto;

import com.fedotaxi.model.TripStatus;
import lombok.Data;

@Data
public class TripUpdateDTO {
    private TripStatus status;
}
