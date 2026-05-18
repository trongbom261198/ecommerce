package com.ecommerce.deliveryservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrackingResponse {

    private UUID shipmentId;
    private String trackingNumber;
    private String carrier;
    private String status;
    private LocalDateTime estimatedDelivery;
    private List<TrackingEvent> events;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TrackingEvent {
        private String status;
        private String location;
        private LocalDateTime timestamp;
        private String description;
    }
}
