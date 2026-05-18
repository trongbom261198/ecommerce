package com.ecommerce.productservice.config;

import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.service.MinioService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// ElasticsearchSyncService intentionally NOT injected here — ES sync is done
// by ElasticsearchInitializer (Order 20) which runs after this runner.

/**
 * Runs once at startup: finds products with relative image paths (/images/...),
 * downloads a real image from picsum.photos, uploads to MinIO, and saves the
 * MinIO URL back to the products table. Then triggers an ES re-sync.
 */
@Slf4j
@Component
@Order(10)
@RequiredArgsConstructor
public class ImageMigrationRunner implements ApplicationRunner {

    private final ProductRepository productRepository;
    private final MinioService minioService;

    // slug → list of picsum seed strings (one seed per image needed)
    private static final Map<String, List<String>> SLUG_TO_SEEDS = Map.ofEntries(
            Map.entry("iphone-15-pro",               List.of("iphone15pro-a", "iphone15pro-b")),
            Map.entry("samsung-galaxy-s24-ultra",     List.of("galaxys24-a",   "galaxys24-b")),
            Map.entry("xiaomi-14-pro",                List.of("xiaomi14pro-a")),
            Map.entry("macbook-pro-14-m3",            List.of("macbook14-a",   "macbook14-b")),
            Map.entry("dell-xps-15-2024",             List.of("dellxps15-a")),
            Map.entry("asus-rog-zephyrus-g14-2024",   List.of("rogzephyrus-a")),
            Map.entry("sony-wh-1000xm5",              List.of("sonywh1000-a")),
            Map.entry("apple-airpods-pro-2",          List.of("airpodspro2-a")),
            Map.entry("nike-air-force-1-low",         List.of("nikeaf1-a",     "nikeaf1-b")),
            Map.entry("adidas-ultraboost-23",         List.of("ultraboost23-a")),
            Map.entry("converse-chuck-taylor-all-star",List.of("converse-a")),
            Map.entry("uniqlo-ultra-light-down-jacket",List.of("uniqlodown-a")),
            Map.entry("levis-511-slim-fit-jeans",     List.of("levis511-a")),
            Map.entry("garmin-forerunner-265",        List.of("garmin265-a")),
            Map.entry("yonex-nanoray-900",            List.of("yonex900-a")),
            Map.entry("atomic-habits",                List.of("atomichabits-a")),
            Map.entry("clean-code",                   List.of("cleancode-a"))
    );

    private final HttpClient http = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.ALWAYS)
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Override
    public void run(ApplicationArguments args) {
        List<Product> products;
        try {
            // Needs migration: still has old relative paths ("/images/...") OR old full URLs ("http://...")
            products = productRepository.findAll().stream()
                    .filter(p -> p.getImages() != null && p.getImages().stream()
                            .anyMatch(img -> img.startsWith("/") || img.startsWith("http")))
                    .toList();
        } catch (Exception e) {
            log.warn("ImageMigrationRunner: could not query products — {}", e.getMessage());
            return;
        }

        if (products.isEmpty()) {
            log.info("ImageMigrationRunner: all images already clean, skipping.");
            return;
        }

        log.info("ImageMigrationRunner: normalizing images for {} product(s)", products.size());

        for (Product product : products) {
            try {
                List<String> normalized = normalizeImages(product);
                if (!normalized.isEmpty()) {
                    product.setImages(normalized);
                    product.setEsSynced(false);
                    productRepository.save(product);
                    log.info("  ✓ {} → {}", product.getSlug(), normalized);
                }
            } catch (Exception e) {
                log.warn("  ✗ Failed to normalize images for {}: {}", product.getSlug(), e.getMessage());
            }
        }

        log.info("ImageMigrationRunner: done. ElasticsearchInitializer will handle ES sync next.");
    }

    /**
     * Returns a list of clean filenames (no host/protocol) for the product.
     * - If image is already a plain filename (no "/" or "http") → keep as-is
     * - If image is a full http:// URL → extract just the filename after the last "/"
     * - If image is a relative path "/images/..." → download from picsum and upload to MinIO
     */
    private List<String> normalizeImages(Product product) {
        List<String> result = new ArrayList<>();

        // Check if any image is a full URL (already uploaded to MinIO or elsewhere)
        boolean hasFullUrl = product.getImages().stream().anyMatch(img -> img.startsWith("http"));
        if (hasFullUrl) {
            // Strip to filename only (everything after last "/")
            for (String img : product.getImages()) {
                int lastSlash = img.lastIndexOf('/');
                result.add(lastSlash >= 0 ? img.substring(lastSlash + 1) : img);
            }
            return result;
        }

        // Has old relative paths like "/images/..." → download from picsum and upload fresh
        List<String> seeds = SLUG_TO_SEEDS.getOrDefault(
                product.getSlug(), List.of(product.getSlug()));

        for (String seed : seeds) {
            String picsumUrl = "https://picsum.photos/seed/" + seed + "/800/800";
            String filename = downloadAndUpload(picsumUrl, product.getSlug(), seed);
            if (filename != null) result.add(filename);
        }
        return result;
    }

    private String downloadAndUpload(String sourceUrl, String slug, String seed) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(sourceUrl))
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();

            HttpResponse<byte[]> response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());

            if (response.statusCode() != 200) {
                log.warn("  HTTP {} for {}", response.statusCode(), sourceUrl);
                return null;
            }

            String filename = slug + "-" + seed + "-" + UUID.randomUUID().toString().substring(0, 8) + ".jpg";
            return minioService.uploadBytes(response.body(), filename, "image/jpeg");

        } catch (Exception e) {
            log.warn("  Download failed for {}: {}", sourceUrl, e.getMessage());
            return null;
        }
    }
}
