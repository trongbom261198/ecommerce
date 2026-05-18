package com.ecommerce.orderservice.repository;

import com.ecommerce.orderservice.entity.OrderAuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface OrderAuditEventRepository extends JpaRepository<OrderAuditEvent, UUID> {

    List<OrderAuditEvent> findByOrderIdOrderByCreatedAtDesc(UUID orderId);
}
