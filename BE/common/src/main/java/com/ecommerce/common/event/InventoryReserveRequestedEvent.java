package com.ecommerce.common.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

/**
 * Event published by the order service to request stock reservation for an order.
 * Consumed by the inventory service.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryReserveRequestedEvent implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String orderId;
    private List<ReserveItem> items;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ReserveItem implements Serializable {

        @Serial
        private static final long serialVersionUID = 1L;

        private String skuId;
        private int quantity;
        private String warehouseId;
    }
}
