package com.ecommerce.orderservice.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
public class FlashSaleItemResponse {
    private UUID id;
    private UUID skuId;
    private UUID productId;
    private String productName;
    private BigDecimal originalPrice;
    private BigDecimal salePrice;
    private int quota;
    private int sold;
    private int remaining;  // quota - sold (from Redis when ACTIVE, from DB otherwise)
}
