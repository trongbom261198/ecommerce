package com.ecommerce.orderservice.dto;

import com.ecommerce.orderservice.entity.DiscountType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
public class FlashSaleRequest {

    @NotBlank
    private String name;

    private String description;

    @NotNull
    private DiscountType discountType;

    @NotNull
    @DecimalMin(value = "0", inclusive = false)
    private BigDecimal discountValue;

    /** NULL = unlimited total quota. */
    @Min(1)
    private Integer maxQuantity;

    @NotNull
    private LocalDateTime startTime;

    @NotNull
    private LocalDateTime endTime;

    @NotEmpty
    @Valid
    private List<FlashSaleItemRequest> items;
}
