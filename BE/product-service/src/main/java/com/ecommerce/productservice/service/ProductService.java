package com.ecommerce.productservice.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.query_dsl.BoolQuery;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;
import co.elastic.clients.elasticsearch.core.SearchRequest;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import com.ecommerce.common.dto.PageResponse;
import com.ecommerce.common.exception.ConflictException;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.productservice.document.ProductDocument;
import com.ecommerce.productservice.dto.*;
import com.ecommerce.productservice.entity.Category;
import com.ecommerce.productservice.entity.Product;
import com.ecommerce.productservice.entity.ProductStatus;
import com.ecommerce.productservice.entity.Sku;
import com.ecommerce.productservice.mapper.ProductMapper;
import com.ecommerce.productservice.repository.CategoryRepository;
import com.ecommerce.productservice.repository.ProductRepository;
import com.ecommerce.productservice.repository.SkuRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final SkuRepository skuRepository;
    private final ProductMapper productMapper;
    private final ElasticsearchSyncService esSyncService;
    private final ElasticsearchClient elasticsearchClient;

    public int resyncAllToElasticsearch() {
        List<Product> all = productRepository.findAllActiveWithSkus();
        int count = esSyncService.syncBatch(all);
        List<UUID> ids = all.stream().map(Product::getId).toList();
        if (!ids.isEmpty()) {
            productRepository.markEsSynced(ids);
        }
        log.info("ES resync: indexed {} products", count);
        return count;
    }

    @Transactional(readOnly = true)
    public PageResponse<ProductResponse> getProducts(ProductSearchRequest request) {
        try {
            return searchWithElasticsearch(request);
        } catch (Exception e) {
            e.printStackTrace();
            log.warn("Elasticsearch unavailable, falling back to JPA: {}", e.getMessage());
            return searchWithJpa(request);
        }
    }

    @Transactional(readOnly = true)
    public ProductResponse getProductById(UUID id) {
        Product product = findProductById(id);
        return toProductResponseWithSkus(product);
    }

    @Transactional(readOnly = true)
    public List<String> getBrands() {
        return productRepository.findDistinctBrands();
    }

    @Transactional(readOnly = true)
    public List<ProductResponse> getRelatedProducts(UUID productId, int limit) {
        Product product = findProductById(productId);
        if (product.getCategory() == null) return List.of();
        Pageable pageable = PageRequest.of(0, limit, Sort.by(Sort.Direction.DESC, "avgRating"));
        return productRepository
                .findRelatedProducts(product.getCategory().getId(), productId, pageable)
                .stream()
                .map(this::toProductResponseWithSkus)
                .toList();
    }

    @Transactional(readOnly = true)
    public ProductResponse getProductBySlug(String slug) {
        Product product = productRepository.findBySlug(slug)
                .orElseThrow(() -> new NotFoundException("PRODUCT_NOT_FOUND", "Product not found with slug: " + slug));
        return toProductResponseWithSkus(product);
    }

    @Transactional
    public ProductResponse createProduct(ProductRequest request) {
        Category category = findCategoryById(request.getCategoryId());
        String slug = generateSlug(request.getName());
        // Ensure uniqueness
        String finalSlug = slug;
        int suffix = 1;
        while (productRepository.existsBySlug(finalSlug)) {
            finalSlug = slug + "-" + suffix++;
        }

        Product product = Product.builder()
                .category(category)
                .name(request.getName())
                .slug(finalSlug)
                .description(request.getDescription())
                .brand(request.getBrand())
                .basePrice(request.getBasePrice())
                .status(request.getStatus() != null ? request.getStatus() : ProductStatus.ACTIVE)
                .attributes(request.getAttributes())
                .images(request.getImages() != null ? request.getImages() : new ArrayList<>())
                .esSynced(false)
                .build();

        Product saved = productRepository.save(product);
        esSyncService.syncProduct(saved);

        return toProductResponseWithSkus(saved);
    }

    @Transactional
    public ProductResponse updateProduct(UUID id, ProductRequest request) {
        Product product = findProductById(id);
        Category category = findCategoryById(request.getCategoryId());

        // Regenerate slug only if name changed
        if (!product.getName().equals(request.getName())) {
            String newSlug = generateSlug(request.getName());
            String finalSlug = newSlug;
            int suffix = 1;
            while (productRepository.existsBySlug(finalSlug) && !finalSlug.equals(product.getSlug())) {
                finalSlug = newSlug + "-" + suffix++;
            }
            product.setSlug(finalSlug);
        }

        product.setCategory(category);
        product.setName(request.getName());
        product.setDescription(request.getDescription());
        product.setBrand(request.getBrand());
        product.setBasePrice(request.getBasePrice());
        if (request.getStatus() != null) {
            product.setStatus(request.getStatus());
        }
        product.setAttributes(request.getAttributes());
        if (request.getImages() != null) {
            product.setImages(request.getImages());
        }
        product.setEsSynced(false);

        Product saved = productRepository.save(product);
        esSyncService.syncProduct(saved);

        return toProductResponseWithSkus(saved);
    }

    @Transactional
    public void deleteProduct(UUID id) {
        Product product = findProductById(id);
        product.setStatus(ProductStatus.DELETED);
        productRepository.save(product);
        esSyncService.removeProduct(id.toString());
    }

    @Transactional(readOnly = true)
    public List<SkuResponse> getSkusByProductId(UUID productId) {
        findProductById(productId); // validate exists
        return productMapper.toSkuResponseList(skuRepository.findByProductId(productId));
    }

    @Transactional
    public SkuResponse createSku(UUID productId, SkuRequest request) {
        Product product = findProductById(productId);

        if (skuRepository.existsBySkuCode(request.getSkuCode())) {
            throw new ConflictException("SKU_CODE_EXISTS", "SKU with code '" + request.getSkuCode() + "' already exists");
        }

        Sku sku = Sku.builder()
                .product(product)
                .skuCode(request.getSkuCode())
                .variantName(request.getVariantName())
                .attributes(request.getAttributes())
                .price(request.getPrice() != null ? request.getPrice() : product.getBasePrice())
                .costPrice(request.getCostPrice())
                .weightGrams(request.getWeightGrams())
                .active(request.isActive())
                .build();

        Sku saved = skuRepository.save(sku);

        // Re-sync product to ES to update price ranges
        esSyncService.syncProduct(product);

        return productMapper.toSkuResponse(saved);
    }

    @Transactional
    public SkuResponse updateSku(UUID productId, UUID skuId, SkuRequest request) {
        findProductById(productId); // validate product exists
        Sku sku = skuRepository.findById(skuId)
                .orElseThrow(() -> new NotFoundException("SKU_NOT_FOUND", "SKU not found with id: " + skuId));

        if (!sku.getProduct().getId().equals(productId)) {
            throw new NotFoundException("SKU_NOT_FOUND", "SKU " + skuId + " does not belong to product " + productId);
        }

        if (!sku.getSkuCode().equals(request.getSkuCode()) && skuRepository.existsBySkuCode(request.getSkuCode())) {
            throw new ConflictException("SKU_CODE_EXISTS", "SKU with code '" + request.getSkuCode() + "' already exists");
        }

        sku.setSkuCode(request.getSkuCode());
        sku.setVariantName(request.getVariantName());
        sku.setAttributes(request.getAttributes());
        if (request.getPrice() != null) {
            sku.setPrice(request.getPrice());
        }
        sku.setCostPrice(request.getCostPrice());
        sku.setWeightGrams(request.getWeightGrams());
        sku.setActive(request.isActive());

        Sku saved = skuRepository.save(sku);

        // Re-sync product to ES
        esSyncService.syncProduct(sku.getProduct());

        return productMapper.toSkuResponse(saved);
    }

    @Transactional
    public void deleteSku(UUID productId, UUID skuId) {
        findProductById(productId);
        Sku sku = skuRepository.findById(skuId)
                .orElseThrow(() -> new NotFoundException("SKU_NOT_FOUND", "SKU not found: " + skuId));
        if (!sku.getProduct().getId().equals(productId)) {
            throw new NotFoundException("SKU_NOT_FOUND", "SKU " + skuId + " does not belong to product " + productId);
        }
        skuRepository.delete(sku);
        esSyncService.syncProduct(sku.getProduct());
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private PageResponse<ProductResponse> searchWithElasticsearch(ProductSearchRequest request) throws IOException {
        BoolQuery.Builder boolQuery = new BoolQuery.Builder();

        // Full-text search when q is provided; matchAll for browse
        boolean hasQuery = request.getQ() != null && !request.getQ().isBlank();
        if (hasQuery) {
            boolQuery.must(Query.of(q -> q.multiMatch(mm -> mm
                    .query(request.getQ())
                    .fields("name", "description", "brand")
                    .fuzziness("AUTO")
            )));
        } else {
            boolQuery.must(Query.of(q -> q.matchAll(m -> m)));
        }

        // Category filter
        if (request.getCategoryId() != null) {
            boolQuery.filter(Query.of(q -> q.term(t -> t
                    .field("categoryId")
                    .value(request.getCategoryId().toString())
            )));
        }

        // Brand filter
        if (request.getBrand() != null && !request.getBrand().isBlank()) {
            boolQuery.filter(Query.of(q -> q.term(t -> t
                    .field("brand")
                    .value(request.getBrand())
            )));
        }

        // Price range filter
        if (request.getMinPrice() != null || request.getMaxPrice() != null) {
            boolQuery.filter(Query.of(q -> q.range(r -> {
                r.field("basePrice");
                if (request.getMinPrice() != null) {
                    r.gte(co.elastic.clients.json.JsonData.of(request.getMinPrice()));
                }
                if (request.getMaxPrice() != null) {
                    r.lte(co.elastic.clients.json.JsonData.of(request.getMaxPrice()));
                }
                return r;
            })));
        }

        // Always exclude DELETED
        boolQuery.filter(Query.of(q -> q.term(t -> t
                .field("status")
                .value("ACTIVE")
        )));

        int from = request.getPage() * request.getSize();

        SearchRequest searchRequest = SearchRequest.of(s -> s
                .index("products")
                .query(Query.of(q -> q.bool(boolQuery.build())))
                .from(from)
                .size(request.getSize())
        );

        SearchResponse<ProductDocument> response = elasticsearchClient.search(searchRequest, ProductDocument.class);

        long total = response.hits().total() != null ? response.hits().total().value() : 0;
        List<ProductResponse> productResponses = response.hits().hits().stream()
                .map(Hit::source)
                .filter(doc -> doc != null)
                .map(this::documentToProductResponse)
                .toList();

        Page<ProductResponse> page = new PageImpl<>(
                productResponses,
                PageRequest.of(request.getPage(), request.getSize()),
                total
        );
        return PageResponse.from(page);
    }

    private PageResponse<ProductResponse> searchWithJpa(ProductSearchRequest request) {
        Sort sort = buildSort(request.getSortBy(), request.getSortDir());
        Pageable pageable = PageRequest.of(request.getPage(), request.getSize(), sort);

        Page<Product> page = productRepository.findWithFilters(
                request.getCategoryId(),
                request.getBrand(),
                request.getMinPrice(),
                request.getMaxPrice(),
                pageable
        );

        return PageResponse.from(page.map(this::toProductResponseWithSkus));
    }

    private Sort buildSort(String sortBy, String sortDir) {
        String field = (sortBy != null && !sortBy.isBlank()) ? sortBy : "createdAt";
        Sort.Direction direction = "asc".equalsIgnoreCase(sortDir) ? Sort.Direction.ASC : Sort.Direction.DESC;
        return Sort.by(direction, field);
    }

    private ProductResponse toProductResponseWithSkus(Product product) {
        ProductResponse response = productMapper.toProductResponse(product);
        response.setSkus(productMapper.toSkuResponseList(product.getSkus()));
        return response;
    }

    private ProductResponse documentToProductResponse(ProductDocument doc) {
        List<SkuResponse> skus = doc.getSkus() != null
                ? doc.getSkus().stream()
                        .map(s -> SkuResponse.builder()
                                .id(UUID.fromString(s.getId()))
                                .skuCode(s.getSkuCode())
                                .variantName(s.getVariantName())
                                .attributes(s.getAttributes())
                                .price(s.getPrice())
                                .active(s.isActive())
                                .build())
                        .toList()
                : List.of();

        return ProductResponse.builder()
                .id(UUID.fromString(doc.getId()))
                .categoryId(doc.getCategoryId() != null ? UUID.fromString(doc.getCategoryId()) : null)
                .categoryName(doc.getCategoryName())
                .name(doc.getName())
                .description(doc.getDescription())
                .brand(doc.getBrand())
                .basePrice(doc.getBasePrice())
                .status(doc.getStatus() != null ? ProductStatus.valueOf(doc.getStatus()) : null)
                .attributes(doc.getAttributes())
                .images(doc.getImages())
                .skus(skus)
                .createdAt(doc.getCreatedAt())
                .avgRating(doc.getAvgRating() != null ? doc.getAvgRating() : 0.0)
                .reviewCount(doc.getReviewCount() != null ? doc.getReviewCount() : 0)
                .build();
    }

    private Product findProductById(UUID id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("PRODUCT_NOT_FOUND", "Product not found with id: " + id));
    }

    private Category findCategoryById(UUID id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("CATEGORY_NOT_FOUND", "Category not found with id: " + id));
    }

    private String generateSlug(String name) {
        String normalized = Normalizer.normalize(name, Normalizer.Form.NFD);
        Pattern pattern = Pattern.compile("\\p{InCombiningDiacriticalMarks}+");
        return pattern.matcher(normalized)
                .replaceAll("")
                .toLowerCase()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("[\\s-]+", "-")
                .replaceAll("^-|-$", "");
    }
}
