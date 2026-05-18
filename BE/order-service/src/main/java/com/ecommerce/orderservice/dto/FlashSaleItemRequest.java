package com.ecommerce.orderservice.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class FlashSaleItemRequest {

    @NotNull
    private UUID skuId;

    @NotNull
    private UUID productId;

    private String productName;

    @NotNull
    @DecimalMin("0")
    private BigDecimal originalPrice;

    @NotNull
    @DecimalMin("0")
    private BigDecimal salePrice;

    @NotNull
    @Min(1)
    private Integer quota;
}
