package com.ecommerce.orderservice.dto;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class OrderItemResponse {

    private UUID id;
    private UUID skuId;
    private UUID productId;
    private String productName;
    private String skuCode;
    private String variantName;
    private int quantity;
    private BigDecimal unitPrice;
    private BigDecimal subtotal;
    private List<String> images;
}
