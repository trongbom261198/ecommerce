package com.ecommerce.orderservice.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class CartRequest {

    @NotBlank(message = "SKU ID is required")
    private String skuId;

    private String productId;

    @NotBlank(message = "Product name is required")
    private String productName;

    private String skuCode;
    private String variantName;

    @Min(value = 1, message = "Quantity must be at least 1")
    private int quantity;

    @NotNull(message = "Unit price is required")
    private BigDecimal unitPrice;

    private List<String> images;
}
