package com.ecommerce.common.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * Event published whenever a shipment's status changes (e.g. IN_TRANSIT → OUT_FOR_DELIVERY).
 * Consumed by the order service and notification service.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShipmentStatusChangedEvent implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String shipmentId;
    private String orderId;
    private String fromStatus;
    private String toStatus;
    /** Physical location description at the time of the status change. */
    private String location;
    private LocalDateTime changedAt;
}
