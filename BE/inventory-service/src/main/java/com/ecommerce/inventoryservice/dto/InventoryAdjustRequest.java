package com.ecommerce.inventoryservice.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryAdjustRequest {

    @NotNull(message = "SKU ID is required")
    private UUID skuId;

    @NotNull(message = "Warehouse ID is required")
    private UUID warehouseId;

    /**
     * Positive value increases stock, negative decreases stock.
     */
    private int quantityDelta;

    private String reason;
}
