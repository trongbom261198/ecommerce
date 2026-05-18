package com.ecommerce.orderservice.service;

import com.ecommerce.common.exception.BusinessException;
import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.orderservice.dto.*;
import com.ecommerce.orderservice.entity.*;
import com.ecommerce.orderservice.repository.FlashSaleItemRepository;
import com.ecommerce.orderservice.repository.FlashSaleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class FlashSaleService {

    private final FlashSaleRepository        flashSaleRepo;
    private final FlashSaleItemRepository    flashSaleItemRepo;
    private final FlashSaleRedisService      redisService;

    // ── Admin CRUD ────────────────────────────────────────────────────────────

    public FlashSaleResponse create(FlashSaleRequest req, UUID adminId) {
        validateTimes(req.getStartTime(), req.getEndTime());

        FlashSale sale = FlashSale.builder()
                .name(req.getName())
                .description(req.getDescription())
                .status(FlashSaleStatus.SCHEDULED)
                .discountType(req.getDiscountType())
                .discountValue(req.getDiscountValue())
                .maxQuantity(req.getMaxQuantity())
                .startTime(req.getStartTime())
                .endTime(req.getEndTime())
                .createdBy(adminId)
                .build();

        req.getItems().forEach(i -> sale.getItems().add(buildItem(sale, i)));
        return toResponse(flashSaleRepo.save(sale));
    }

    public FlashSaleResponse update(UUID id, FlashSaleRequest req) {
        FlashSale sale = findOrThrow(id);
        if (sale.getStatus() == FlashSaleStatus.ACTIVE) {
            throw new BusinessException(422, "FLASH_SALE_ACTIVE", "Cannot edit an active flash sale");
        }
        validateTimes(req.getStartTime(), req.getEndTime());

        sale.setName(req.getName());
        sale.setDescription(req.getDescription());
        sale.setDiscountType(req.getDiscountType());
        sale.setDiscountValue(req.getDiscountValue());
        sale.setMaxQuantity(req.getMaxQuantity());
        sale.setStartTime(req.getStartTime());
        sale.setEndTime(req.getEndTime());

        sale.getItems().clear();
        req.getItems().forEach(i -> sale.getItems().add(buildItem(sale, i)));
        return toResponse(flashSaleRepo.save(sale));
    }

    public void cancel(UUID id) {
        FlashSale sale = findOrThrow(id);
        if (sale.getStatus() == FlashSaleStatus.ENDED) {
            throw new BusinessException(422, "FLASH_SALE_ENDED", "Sale already ended");
        }
        if (sale.getStatus() == FlashSaleStatus.ACTIVE) {
            sale.getItems().forEach(item -> redisService.clearQuota(id, item.getSkuId()));
        }
        sale.setStatus(FlashSaleStatus.CANCELLED);
        flashSaleRepo.save(sale);
        log.info("[FlashSale] Sale {} cancelled", id);
    }

    @Transactional(readOnly = true)
    public Page<FlashSaleResponse> listAll(Pageable pageable) {
        return flashSaleRepo.findAllByOrderByCreatedAtDesc(pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public FlashSaleResponse getById(UUID id) {
        return toResponse(findOrThrow(id));
    }

    // ── Lifecycle (called by scheduler) ──────────────────────────────────────

    public void activate(UUID id) {
        FlashSale sale = findOrThrow(id);
        if (sale.getStatus() != FlashSaleStatus.SCHEDULED) return;

        sale.setStatus(FlashSaleStatus.ACTIVE);
        flashSaleRepo.save(sale);

        // Pre-load quotas into Redis
        sale.getItems().forEach(item ->
                redisService.loadQuota(id, item.getSkuId(), item.getQuota() - item.getSold()));
        log.info("[FlashSale] Sale {} activated, {} items loaded into Redis", id, sale.getItems().size());
    }

    public void end(UUID id) {
        FlashSale sale = findOrThrow(id);
        if (sale.getStatus() != FlashSaleStatus.ACTIVE) return;

        sale.getItems().forEach(item -> redisService.clearQuota(id, item.getSkuId()));
        sale.setStatus(FlashSaleStatus.ENDED);
        flashSaleRepo.save(sale);
        log.info("[FlashSale] Sale {} ended", id);
    }

    // ── Purchase flow (called by OrderService at checkout) ───────────────────

    /**
     * Validates and reserves flash sale stock for a single SKU.
     * Returns the applied discount amount for the given qty at unit price.
     *
     * Rate-limit → Idempotency → Redis atomic decrement (Lua).
     */
    public BigDecimal reserveAndGetDiscount(UUID saleId, UUID skuId, int qty,
                                            BigDecimal unitPrice, UUID userId) {
        // 1. Rate limit: one attempt per 5s per user
        if (!redisService.checkRateLimit(userId)) {
            throw new BusinessException(429, "RATE_LIMITED", "Too many requests, please wait a moment");
        }

        // 2. Idempotency: prevent duplicate purchase in same sale
        FlashSale sale = findOrThrow(saleId);
        if (sale.getStatus() != FlashSaleStatus.ACTIVE) {
            throw new BusinessException(422, "FLASH_SALE_INACTIVE", "Flash sale is not active");
        }
        if (LocalDateTime.now().isAfter(sale.getEndTime())) {
            throw new BusinessException(422, "FLASH_SALE_EXPIRED", "Flash sale has ended");
        }

        boolean isFirst = redisService.markPurchased(saleId, userId,
                Duration.between(LocalDateTime.now(), sale.getEndTime()).getSeconds() + 3600);
        if (!isFirst) {
            throw new BusinessException(422, "ALREADY_PURCHASED", "You already purchased this flash sale");
        }

        // 3. Atomic quota decrement in Redis
        long remaining = redisService.decrementQuota(saleId, skuId, qty);
        if (remaining < 0) {
            redisService.clearPurchased(saleId, userId); // rollback idempotency mark
            throw new BusinessException(422, "FLASH_SALE_SOLD_OUT", "Flash sale item is sold out");
        }

        // 4. Optimistically update DB sold count (async reconciliation on failure)
        FlashSaleItem item = flashSaleItemRepo.findByFlashSaleIdAndSkuId(saleId, skuId)
                .orElseThrow(() -> new NotFoundException("Flash sale item not found"));
        int updated = flashSaleItemRepo.incrementSold(item.getId(), qty);
        if (updated == 0) {
            // DB quota exceeded — restore Redis and rollback
            redisService.restoreQuota(saleId, skuId, qty);
            redisService.clearPurchased(saleId, userId);
            throw new BusinessException(422, "FLASH_SALE_SOLD_OUT", "Flash sale item is sold out");
        }

        return calculateDiscount(sale, unitPrice, qty);
    }

    /** Restores quota on order cancellation. */
    public void releaseReservation(UUID saleId, UUID skuId, int qty, UUID userId) {
        flashSaleItemRepo.findByFlashSaleIdAndSkuId(saleId, skuId).ifPresent(item -> {
            flashSaleItemRepo.decrementSold(item.getId(), qty);
            // Only restore Redis quota if sale is still ACTIVE
            FlashSale sale = flashSaleRepo.findById(saleId).orElse(null);
            if (sale != null && sale.getStatus() == FlashSaleStatus.ACTIVE) {
                redisService.restoreQuota(saleId, skuId, qty);
            }
            if (userId != null) redisService.clearPurchased(saleId, userId);
        });
    }

    // ── Customer-facing ───────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<FlashSaleResponse> getActiveSales() {
        return flashSaleRepo.findCurrentlyActive(LocalDateTime.now()).stream()
                .map(this::toResponse)
                .toList();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private FlashSale findOrThrow(UUID id) {
        return flashSaleRepo.findById(id)
                .orElseThrow(() -> new NotFoundException("Flash sale not found: " + id));
    }

    private void validateTimes(LocalDateTime start, LocalDateTime end) {
        if (!end.isAfter(start)) {
            throw new BusinessException(400, "INVALID_TIMES", "endTime must be after startTime");
        }
    }

    private FlashSaleItem buildItem(FlashSale sale, FlashSaleItemRequest req) {
        return FlashSaleItem.builder()
                .flashSale(sale)
                .skuId(req.getSkuId())
                .productId(req.getProductId())
                .productName(req.getProductName())
                .originalPrice(req.getOriginalPrice())
                .salePrice(req.getSalePrice())
                .quota(req.getQuota())
                .sold(0)
                .build();
    }

    private BigDecimal calculateDiscount(FlashSale sale, BigDecimal unitPrice, int qty) {
        BigDecimal total = unitPrice.multiply(BigDecimal.valueOf(qty));
        if (sale.getDiscountType() == DiscountType.PERCENTAGE) {
            return total.multiply(sale.getDiscountValue())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        // FIXED: per-item discount capped at total
        BigDecimal fixed = sale.getDiscountValue().multiply(BigDecimal.valueOf(qty));
        return fixed.min(total);
    }

    FlashSaleResponse toResponse(FlashSale sale) {
        List<FlashSaleItemResponse> itemResponses = sale.getItems().stream()
                .map(item -> {
                    Long redisRemaining = sale.getStatus() == FlashSaleStatus.ACTIVE
                            ? redisService.getRemaining(sale.getId(), item.getSkuId()) : null;
                    int remaining = redisRemaining != null
                            ? redisRemaining.intValue()
                            : (item.getQuota() - item.getSold());
                    return FlashSaleItemResponse.builder()
                            .id(item.getId())
                            .skuId(item.getSkuId())
                            .productId(item.getProductId())
                            .productName(item.getProductName())
                            .originalPrice(item.getOriginalPrice())
                            .salePrice(item.getSalePrice())
                            .quota(item.getQuota())
                            .sold(item.getSold())
                            .remaining(Math.max(0, remaining))
                            .build();
                })
                .toList();

        return FlashSaleResponse.builder()
                .id(sale.getId())
                .name(sale.getName())
                .description(sale.getDescription())
                .status(sale.getStatus())
                .discountType(sale.getDiscountType())
                .discountValue(sale.getDiscountValue())
                .maxQuantity(sale.getMaxQuantity())
                .soldQuantity(sale.getSoldQuantity())
                .startTime(sale.getStartTime())
                .endTime(sale.getEndTime())
                .createdAt(sale.getCreatedAt())
                .items(itemResponses)
                .build();
    }
}
