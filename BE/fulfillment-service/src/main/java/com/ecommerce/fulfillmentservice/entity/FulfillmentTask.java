package com.ecommerce.fulfillmentservice.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "fulfillment_tasks")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FulfillmentTask {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String orderId;

    private String shipmentId;

    /**
     * Current task status.
     * Values: PENDING, ASSIGNED, PICKING, PACKING, PACKED, CANCELLED
     */
    @Builder.Default
    @Column(nullable = false)
    private String status = "PENDING";

    private UUID warehouseId;

    private LocalDateTime slaDeadline;

    private LocalDateTime assignedAt;

    private LocalDateTime pickedAt;

    private LocalDateTime packedAt;

    /** UUID of the warehouse staff member assigned to this task. */
    private UUID assignedTo;

    @Builder.Default
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(
            name = "fulfillment_task_items",
            joinColumns = @JoinColumn(name = "task_id")
    )
    private List<FulfillmentTaskItem> items = new ArrayList<>();

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
