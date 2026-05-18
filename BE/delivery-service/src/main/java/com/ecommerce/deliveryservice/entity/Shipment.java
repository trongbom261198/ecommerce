package com.ecommerce.deliveryservice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "shipments")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Shipment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID orderId;

    private String trackingNumber;

    /** Carrier code: GHN, GHTK, MANUAL */
    private String carrier;

    private String carrierTrackingUrl;

    /**
     * Shipment lifecycle status.
     * Values: PENDING, ASSIGNED_DRIVER, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, FAILED, RETURNED
     */
    @Builder.Default
    private String status = "PENDING";

    private UUID fromWarehouseId;

    private LocalDateTime estimatedDelivery;

    private LocalDateTime actualDelivery;

    /** Serialised route data stored as JSONB. */
    @Column(columnDefinition = "jsonb")
    private String routeData;

    private LocalDateTime slaDeadline;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
