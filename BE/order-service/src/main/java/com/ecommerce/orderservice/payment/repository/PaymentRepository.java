package com.ecommerce.orderservice.payment.repository;

import com.ecommerce.orderservice.payment.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {
    Optional<Payment> findByVnpTxnRef(String vnpTxnRef);
}
