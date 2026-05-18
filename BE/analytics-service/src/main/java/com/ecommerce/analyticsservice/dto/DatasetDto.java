package com.ecommerce.analyticsservice.dto;

import com.ecommerce.analyticsservice.domain.DatasetCatalog;

import java.time.Instant;
import java.util.UUID;

public record DatasetDto(
        UUID id,
        String name,
        String description,
        String minioKey,
        Long rowCount,
        Long sizeBytes,
        String sourceType,
        Instant updatedAt
) {
    public static DatasetDto from(DatasetCatalog c) {
        return new DatasetDto(
                c.getId(), c.getName(), c.getDescription(),
                c.getMinioKey(), c.getRowCount(), c.getSizeBytes(),
                c.getSourceType(), c.getUpdatedAt()
        );
    }
}
