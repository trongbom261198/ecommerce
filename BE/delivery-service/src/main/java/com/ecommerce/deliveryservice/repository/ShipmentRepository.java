package com.ecommerce.deliveryservice.repository;

import com.ecommerce.deliveryservice.entity.Shipment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ShipmentRepository extends JpaRepository<Shipment, UUID> {

    Optional<Shipment> findByOrderId(UUID orderId);

    List<Shipment> findByStatus(String status);

    Optional<Shipment> findByTrackingNumber(String trackingNumber);
}
