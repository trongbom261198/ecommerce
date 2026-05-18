package com.ecommerce.common.constant;

/**
 * Centralised constants for all Kafka topic names used across microservices.
 * Defined as an interface so constants can be statically imported without instantiation.
 */
public interface KafkaTopics {

    String ORDER_CREATED                 = "order.created";
    String ORDER_STATUS_CHANGED          = "order.status_changed";
    String INVENTORY_RESERVE_REQUESTED   = "inventory.reserve_requested";
    String INVENTORY_RESERVED            = "inventory.reserved";
    String INVENTORY_RESERVE_FAILED      = "inventory.reserve_failed";
    String FULFILLMENT_TASK_CREATED      = "fulfillment.task_created";
    String FULFILLMENT_PACKED            = "fulfillment.packed";
    String SHIPMENT_STATUS_CHANGED       = "shipment.status_changed";
    String ORDER_DELIVERED               = "order.delivered";

    // Flash sale lifecycle events
    String FLASH_SALE_ACTIVATED          = "flash.sale.activated";
    String FLASH_SALE_ENDED              = "flash.sale.ended";
    String FLASH_SALE_PURCHASED          = "flash.sale.purchased";

    // Review eligibility event — published when order reaches DELIVERED state
    String ORDER_REVIEW_ELIGIBLE         = "order.review_eligible";
}
