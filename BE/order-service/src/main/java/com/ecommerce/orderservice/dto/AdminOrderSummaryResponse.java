package com.ecommerce.orderservice.dto;

import com.ecommerce.orderservice.statemachine.OrderState;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AdminOrderSummaryResponse {

    private UUID id;
    private String orderNumber;
    private UUID userId;
    private OrderState status;
    private BigDecimal subtotal;
    private BigDecimal shippingFee;
    private BigDecimal totalAmount;
    private String paymentMethod;
    private String paymentStatus;
    private int itemCount;
    private Map<String, Object> shippingAddress;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
