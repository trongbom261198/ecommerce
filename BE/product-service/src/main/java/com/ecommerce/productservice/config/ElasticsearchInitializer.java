package com.ecommerce.productservice.config;

import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.service.ElasticsearchSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Runs at startup (Order 20, after ImageMigrationRunner at Order 10).
 *
 * Uses findAllActiveWithSkus() (JOIN FETCH) so SKUs are eagerly loaded within
 * that method's own transaction — no outer @Transactional needed here, which
 * avoids the self-invocation / read-only-tx + write-tx conflict that caused
 * UnexpectedRollbackException.
 */
@Slf4j
@Component
@Order(20)
@RequiredArgsConstructor
public class ElasticsearchInitializer implements ApplicationRunner {

    private final ProductRepository productRepository;
    private final ElasticsearchSyncService esSyncService;

    @Override
    public void run(ApplicationArguments args) {
        try {
            // JOIN FETCH loads skus eagerly inside the repository's own tx —
            // the initialized collections stay accessible after the tx closes.
            List<Product> products = productRepository.findAllActiveWithSkus();

            if (products.isEmpty()) {
                log.info("Elasticsearch: no products found, skipping sync.");
                return;
            }

            log.info("Elasticsearch: full re-index starting for {} product(s)...", products.size());
            int count = esSyncService.syncBatch(products);
            log.info("Elasticsearch: full re-index complete — {} documents indexed.", count);

            // markEsSynced has @Transactional directly on the repository method — no self-invocation.
            List<UUID> ids = products.stream().map(Product::getId).toList();
            productRepository.markEsSynced(ids);

        } catch (Exception e) {
            log.warn("Elasticsearch full re-index skipped: {}", e.getMessage());
        }
    }
}
