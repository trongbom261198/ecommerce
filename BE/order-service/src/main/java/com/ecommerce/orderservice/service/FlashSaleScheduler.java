package com.ecommerce.orderservice.service;

import com.ecommerce.orderservice.entity.FlashSale;
import com.ecommerce.orderservice.repository.FlashSaleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Polls every 30 seconds to auto-activate SCHEDULED sales and auto-end ACTIVE sales.
 * Keeps lifecycle deterministic without relying on external triggers.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FlashSaleScheduler {

    private final FlashSaleRepository flashSaleRepo;
    private final FlashSaleService    flashSaleService;

    @Scheduled(fixedDelay = 30_000)
    public void activateDueSales() {
        List<FlashSale> due = flashSaleRepo.findDueToStart(LocalDateTime.now());
        if (due.isEmpty()) return;
        log.info("[FlashSaleScheduler] Activating {} scheduled sale(s)", due.size());
        due.forEach(s -> {
            try {
                flashSaleService.activate(s.getId());
            } catch (Exception e) {
                log.error("[FlashSaleScheduler] Failed to activate sale {}: {}", s.getId(), e.getMessage());
            }
        });
    }

    @Scheduled(fixedDelay = 30_000)
    public void endExpiredSales() {
        List<FlashSale> expired = flashSaleRepo.findDueToEnd(LocalDateTime.now());
        if (expired.isEmpty()) return;
        log.info("[FlashSaleScheduler] Ending {} expired sale(s)", expired.size());
        expired.forEach(s -> {
            try {
                flashSaleService.end(s.getId());
            } catch (Exception e) {
                log.error("[FlashSaleScheduler] Failed to end sale {}: {}", s.getId(), e.getMessage());
            }
        });
    }
}
