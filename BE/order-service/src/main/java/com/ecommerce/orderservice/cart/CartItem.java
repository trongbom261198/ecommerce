package com.ecommerce.orderservice.cart;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CartItem {

    private String skuId;
    private String productId;
    private String productName;
    private String skuCode;
    private String variantName;
    private int quantity;
    private BigDecimal unitPrice;
    private List<String> images;
}
