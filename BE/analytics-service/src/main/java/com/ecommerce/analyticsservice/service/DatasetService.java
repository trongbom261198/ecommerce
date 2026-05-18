package com.ecommerce.analyticsservice.service;

import com.ecommerce.analyticsservice.domain.DatasetCatalog;
import com.ecommerce.analyticsservice.dto.DatasetDto;
import com.ecommerce.analyticsservice.repository.DatasetCatalogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class DatasetService {

    private final DatasetCatalogRepository catalogRepo;

    public List<DatasetDto> listAll() {
        return catalogRepo.findAll().stream().map(DatasetDto::from).toList();
    }

    public DatasetCatalog upsert(String name, String minioKey, String description,
                                  Long rowCount, String sourceType) {
        DatasetCatalog catalog = catalogRepo.findByMinioKey(minioKey)
                .orElse(new DatasetCatalog());
        catalog.setName(name);
        catalog.setMinioKey(minioKey);
        catalog.setDescription(description);
        catalog.setRowCount(rowCount);
        catalog.setSourceType(sourceType);
        return catalogRepo.save(catalog);
    }
}
