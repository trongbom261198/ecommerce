package com.ecommerce.orderservice.statemachine;

public enum OrderEvent {
    PAYMENT_CONFIRMED,
    WAREHOUSE_ASSIGNED,
    PICKING_STARTED,
    PACKING_DONE,
    CARRIER_PICKED_UP,
    DELIVERY_CONFIRMED,
    REFUND_APPROVED,
    CANCEL
}
