package com.ecommerce.orderservice.dto;

import com.ecommerce.orderservice.statemachine.OrderState;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class OrderSummaryResponse {

    private UUID id;
    private String orderNumber;
    private OrderState status;
    private BigDecimal totalAmount;
    private int itemCount;
    private LocalDateTime createdAt;
}
