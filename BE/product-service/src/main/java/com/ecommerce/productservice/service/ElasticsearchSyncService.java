package com.ecommerce.productservice.service;

import com.ecommerce.productservice.document.ProductDocument;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.Sku;
import com.ecommerce.productservice.repository.ProductSearchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ElasticsearchSyncService {

    private final ProductSearchRepository productSearchRepository;

    @Async
    public void syncProduct(Product product) {
        try {
            productSearchRepository.save(buildDocument(product));
            log.debug("Synced product {} to Elasticsearch", product.getId());
        } catch (Exception e) {
            log.error("Failed to sync product {} to Elasticsearch", product.getId(), e);
        }
    }

    /**
     * Synchronous batch sync — used by startup initializer, not @Async.
     * Returns the number of documents successfully saved.
     */
    public int syncBatch(List<Product> products) {
        List<ProductDocument> docs = products.stream()
                .map(this::buildDocument)
                .toList();
        productSearchRepository.saveAll(docs);
        return docs.size();
    }

    public void removeProduct(String productId) {
        try {
            productSearchRepository.deleteById(productId);
            log.debug("Removed product {} from Elasticsearch", productId);
        } catch (Exception e) {
            log.error("Failed to remove product {} from Elasticsearch", productId, e);
        }
    }

    private ProductDocument buildDocument(Product product) {
        List<Sku> activeSkus = product.getSkus().stream()
                .filter(Sku::isActive)
                .toList();

        BigDecimal minPrice = activeSkus.stream()
                .map(Sku::getPrice)
                .min(Comparator.naturalOrder())
                .orElse(product.getBasePrice());

        BigDecimal maxPrice = activeSkus.stream()
                .map(Sku::getPrice)
                .max(Comparator.naturalOrder())
                .orElse(product.getBasePrice());

        String categoryId = product.getCategory() != null ? product.getCategory().getId().toString() : null;
        String categoryName = product.getCategory() != null ? product.getCategory().getName() : null;

        List<ProductDocument.SkuInfo> skuInfos = product.getSkus().stream()
                .filter(Sku::isActive)
                .map(s -> ProductDocument.SkuInfo.builder()
                        .id(s.getId().toString())
                        .skuCode(s.getSkuCode())
                        .variantName(s.getVariantName())
                        .attributes(s.getAttributes())
                        .price(s.getPrice())
                        .active(s.isActive())
                        .build())
                .toList();

        double avgRating = product.getAvgRating() != null
                ? product.getAvgRating().doubleValue() : 0.0;
        int reviewCount = product.getReviewCount() != null ? product.getReviewCount() : 0;

        return ProductDocument.builder()
                .id(product.getId().toString())
                .name(product.getName())
                .description(product.getDescription())
                .brand(product.getBrand())
                .categoryId(categoryId)
                .categoryName(categoryName)
                .basePrice(product.getBasePrice())
                .minSkuPrice(minPrice)
                .maxSkuPrice(maxPrice)
                .status(product.getStatus().name())
                .images(product.getImages())
                .attributes(product.getAttributes())
                .skus(skuInfos)
                .avgRating(avgRating)
                .reviewCount(reviewCount)
                .createdAt(product.getCreatedAt())
                .updatedAt(product.getUpdatedAt())
                .build();
    }
}
