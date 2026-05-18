package com.ecommerce.orderservice.dto;

import com.ecommerce.orderservice.entity.DiscountType;
import com.ecommerce.orderservice.entity.FlashSaleStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class FlashSaleResponse {
    private UUID id;
    private String name;
    private String description;
    private FlashSaleStatus status;
    private DiscountType discountType;
    private BigDecimal discountValue;
    private Integer maxQuantity;
    private int soldQuantity;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private LocalDateTime createdAt;
    private List<FlashSaleItemResponse> items;
}
