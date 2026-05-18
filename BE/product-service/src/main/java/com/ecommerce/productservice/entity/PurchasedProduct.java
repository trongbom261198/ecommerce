package com.ecommerce.productservice.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "purchased_products")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchasedProduct {

    @EmbeddedId
    private PurchasedProductId id;

    @Column(name = "first_delivered_at", nullable = false)
    @Builder.Default
    private LocalDateTime firstDeliveredAt = LocalDateTime.now();
}
