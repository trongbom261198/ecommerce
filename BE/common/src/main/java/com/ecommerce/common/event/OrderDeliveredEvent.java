package com.ecommerce.common.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * Event published when an order has been successfully delivered to the customer.
 * Triggers post-delivery workflows such as review reminders and loyalty points allocation.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderDeliveredEvent implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String orderId;
    private String shipmentId;
    private LocalDateTime deliveredAt;
}
