package com.ecommerce.common.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Event published by the inventory service when stock has been successfully reserved
 * for an order.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryReservedEvent implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String orderId;
    private List<ReservationResult> results;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ReservationResult implements Serializable {

        @Serial
        private static final long serialVersionUID = 1L;

        private String skuId;
        private int quantity;
        private String warehouseId;
        private LocalDateTime reservedAt;
    }
}
