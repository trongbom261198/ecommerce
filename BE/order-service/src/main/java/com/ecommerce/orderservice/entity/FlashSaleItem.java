package com.ecommerce.orderservice.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(
    name = "flash_sale_items",
    uniqueConstraints = @UniqueConstraint(columnNames = {"flash_sale_id", "sku_id"})
)
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class FlashSaleItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "flash_sale_id", nullable = false)
    private FlashSale flashSale;

    @Column(name = "sku_id", nullable = false)
    private UUID skuId;

    @Column(name = "product_id", nullable = false)
    private UUID productId;

    @Column(name = "product_name", length = 500)
    private String productName;

    @Column(name = "original_price", nullable = false, precision = 19, scale = 4)
    private BigDecimal originalPrice;

    /** Pre-computed sale price (snapshot at creation time). */
    @Column(name = "sale_price", nullable = false, precision = 19, scale = 4)
    private BigDecimal salePrice;

    /** Max units available for this SKU in this flash sale. */
    @Column(nullable = false)
    private Integer quota;

    /** Units sold so far — authoritative DB count (Redis is the fast path). */
    @Column(nullable = false)
    @Builder.Default
    private Integer sold = 0;
}
