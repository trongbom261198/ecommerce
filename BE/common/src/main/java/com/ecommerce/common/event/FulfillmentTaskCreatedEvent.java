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
 * Event published when a fulfillment task is created for a shipment.
 * Consumed by the fulfillment service to begin pick-and-pack operations.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FulfillmentTaskCreatedEvent implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String shipmentId;
    private String orderId;
    private List<FulfillmentItem> items;
    private LocalDateTime slaDeadline;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FulfillmentItem implements Serializable {

        @Serial
        private static final long serialVersionUID = 1L;

        private String skuId;
        private int quantity;
        /** ID of the warehouse from which the item will be picked. */
        private String warehouseId;
    }
}
