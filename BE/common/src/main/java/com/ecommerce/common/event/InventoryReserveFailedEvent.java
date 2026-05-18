package com.ecommerce.common.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * Event published by the inventory service when stock reservation fails for an order.
 * Triggers order cancellation or compensation flow.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryReserveFailedEvent implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String orderId;
    private String reason;
    private LocalDateTime failedAt;
}
