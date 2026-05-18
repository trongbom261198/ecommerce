package com.ecommerce.orderservice.dto;

import com.ecommerce.orderservice.statemachine.OrderState;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class OrderTrackingResponse {

    private UUID orderId;
    private String orderNumber;
    private OrderState status;
    private List<OrderEventResponse> events;

    /** Populated once a shipment record exists (from delivery-service). */
    private String shipmentId;
    private String trackingNumber;
    private LocalDateTime estimatedDelivery;
}
