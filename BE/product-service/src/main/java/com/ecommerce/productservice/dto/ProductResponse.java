package com.ecommerce.productservice.dto;

import com.ecommerce.productservice.entity.ProductStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProductResponse {

    private UUID id;
    private UUID categoryId;
    private String categoryName;
    private String name;
    private String slug;
    private String description;
    private String brand;
    private BigDecimal basePrice;
    private ProductStatus status;
    private Map<String, Object> attributes;
    private List<String> images;
    private List<SkuResponse> skus;
    private LocalDateTime createdAt;
    private Double avgRating;
    private Integer reviewCount;
}
