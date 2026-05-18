package com.ecommerce.common.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * Event published by the fulfillment service when a shipment has been packed
 * and is ready for carrier handoff.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FulfillmentPackedEvent implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String shipmentId;
    private String orderId;
    private LocalDateTime packedAt;
}
