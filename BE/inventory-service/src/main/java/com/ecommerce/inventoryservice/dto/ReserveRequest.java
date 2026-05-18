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
public class ReserveRequest {

    @NotBlank(message = "Order ID is required")
    private String orderId;

    @NotEmpty(message = "At least one item is required")
    @Valid
    private List<ReserveItem> items;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ReserveItem {

        @NotNull(message = "SKU ID is required")
        private UUID skuId;

        @NotNull(message = "Warehouse ID is required")
        private UUID warehouseId;

        private int quantity;
    }
}
