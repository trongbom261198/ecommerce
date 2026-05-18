package com.ecommerce.orderservice.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class OrderEventResponse {

    private String eventType;
    private String fromStatus;
    private String toStatus;
    private String description;
    private LocalDateTime createdAt;
}
