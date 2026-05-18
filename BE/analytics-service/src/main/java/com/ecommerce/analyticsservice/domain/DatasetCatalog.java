package com.ecommerce.analyticsservice.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(schema = "analytics_metadata", name = "dataset_catalog")
@Getter
@Setter
public class DatasetCatalog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "minio_key", nullable = false, length = 500)
    private String minioKey;

    @Column(name = "row_count")
    private Long rowCount;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    // "upload" | "export"
    @Column(name = "source_type", nullable = false, length = 20)
    private String sourceType = "upload";

    @Column(name = "schema_json", columnDefinition = "TEXT")
    private String schemaJson;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
