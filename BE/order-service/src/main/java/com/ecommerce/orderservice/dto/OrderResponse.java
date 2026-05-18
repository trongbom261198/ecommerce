package com.ecommerce.orderservice.dto;

import com.ecommerce.orderservice.entity.PaymentStatus;
import com.ecommerce.orderservice.statemachine.OrderState;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class OrderResponse {

    private UUID id;
    private String orderNumber;
    private UUID userId;
    private OrderState status;
    private BigDecimal subtotal;
    private BigDecimal shippingFee;
    private BigDecimal discountAmount;
    private BigDecimal totalAmount;
    private Map<String, Object> shippingAddress;
    private String paymentMethod;
    private PaymentStatus paymentStatus;
    private String notes;
    private List<OrderItemResponse> items;
    private List<OrderEventResponse> events;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
