package com.ecommerce.orderservice.entity;

public enum FlashSaleStatus {
    DRAFT,      // created, not yet scheduled
    SCHEDULED,  // scheduled for future start_time
    ACTIVE,     // currently running
    ENDED,      // past end_time or sold out
    CANCELLED   // manually cancelled
}
