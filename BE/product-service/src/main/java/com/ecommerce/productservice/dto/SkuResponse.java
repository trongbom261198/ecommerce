package com.ecommerce.productservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SkuResponse {

    private UUID id;
    private String skuCode;
    private String variantName;
    private Map<String, String> attributes;
    private BigDecimal price;
    private boolean active;
}
