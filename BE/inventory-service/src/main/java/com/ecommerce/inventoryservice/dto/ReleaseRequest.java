package com.ecommerce.inventoryservice.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReleaseRequest {

    @NotBlank(message = "Order ID is required")
    private String orderId;

    @NotEmpty(message = "At least one item is required")
    @Valid
    private List<ReleaseItem> items;

    /**
     * When true, also decrements quantityOnHand (fulfillment complete / shipped).
     * When false, only decrements quantityReserved (order cancelled).
     */
    private boolean fulfillmentComplete;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ReleaseItem {

        @NotNull(message = "SKU ID is required")
        private UUID skuId;

        @NotNull(message = "Warehouse ID is required")
        private UUID warehouseId;

        private int quantity;
    }
}
