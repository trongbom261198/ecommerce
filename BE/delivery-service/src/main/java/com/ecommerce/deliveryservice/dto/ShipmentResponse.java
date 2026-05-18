package com.ecommerce.deliveryservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShipmentResponse {

    private UUID id;
    private UUID orderId;
    private String trackingNumber;
    private String carrier;
    private String carrierTrackingUrl;
    private String status;
    private UUID fromWarehouseId;
    private LocalDateTime estimatedDelivery;
    private LocalDateTime actualDelivery;
    private String routeData;
    private LocalDateTime slaDeadline;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
