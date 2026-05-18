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
 * Published when an order is delivered and the buyer becomes eligible to review the products.
 * Consumed by product-service to populate the purchased_products eligibility table.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OrderReviewEligibleEvent implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String orderId;
    private String userId;
    private List<String> productIds;
    private LocalDateTime deliveredAt;
}
