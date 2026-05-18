package com.ecommerce.orderservice.statemachine;

public enum OrderState {
    PENDING,
    CONFIRMED,
    PROCESSING,
    PICKING,
    PACKED,
    SHIPPED,
    DELIVERED,
    CANCELLED,
    REFUNDED
}
