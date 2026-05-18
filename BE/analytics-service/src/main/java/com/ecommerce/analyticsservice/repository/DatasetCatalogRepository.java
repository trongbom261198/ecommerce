package com.ecommerce.analyticsservice.repository;

import com.ecommerce.analyticsservice.domain.DatasetCatalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface DatasetCatalogRepository extends JpaRepository<DatasetCatalog, UUID> {

    Optional<DatasetCatalog> findByMinioKey(String minioKey);

    Optional<DatasetCatalog> findByName(String name);
}
