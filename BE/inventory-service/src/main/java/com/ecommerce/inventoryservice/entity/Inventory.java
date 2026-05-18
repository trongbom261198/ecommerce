package com.ecommerce.inventoryservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
    name = "inventory",
    uniqueConstraints = {
        @UniqueConstraint(columnNames = {"sku_id", "warehouse_id"})
    }
)
public class Inventory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "sku_id", nullable = false)
    private UUID skuId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "warehouse_id", nullable = false)
    private Warehouse warehouse;

    @Column(nullable = false)
    private int quantityOnHand;

    @Column(nullable = false)
    private int quantityReserved;

    @Builder.Default
    @Column(nullable = false)
    private int safetyStock = 10;

    @Version
    private long version;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @Transient
    public int getAvailableQuantity() {
        return quantityOnHand - quantityReserved;
    }
}
