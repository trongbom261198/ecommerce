package com.ecommerce.inventoryservice.repository;

import com.ecommerce.inventoryservice.entity.Warehouse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface WarehouseRepository extends JpaRepository<Warehouse, UUID> {

    List<Warehouse> findByActiveTrue();

    Optional<Warehouse> findByCode(String code);
}
