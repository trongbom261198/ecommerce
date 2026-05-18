package com.ecommerce.orderservice.repository;

import com.ecommerce.orderservice.entity.FlashSale;
import com.ecommerce.orderservice.entity.FlashSaleStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface FlashSaleRepository extends JpaRepository<FlashSale, UUID> {

    Page<FlashSale> findAllByOrderByCreatedAtDesc(Pageable pageable);

    List<FlashSale> findByStatus(FlashSaleStatus status);

    /** Finds SCHEDULED sales whose start_time has arrived — used by scheduler. */
    @Query("SELECT f FROM FlashSale f WHERE f.status = 'SCHEDULED' AND f.startTime <= :now")
    List<FlashSale> findDueToStart(LocalDateTime now);

    /** Finds ACTIVE sales whose end_time has passed — used by scheduler. */
    @Query("SELECT f FROM FlashSale f WHERE f.status = 'ACTIVE' AND f.endTime <= :now")
    List<FlashSale> findDueToEnd(LocalDateTime now);

    /** Active sales visible to customers. */
    @Query("SELECT f FROM FlashSale f WHERE f.status = 'ACTIVE' AND f.startTime <= :now AND f.endTime > :now")
    List<FlashSale> findCurrentlyActive(LocalDateTime now);
}
