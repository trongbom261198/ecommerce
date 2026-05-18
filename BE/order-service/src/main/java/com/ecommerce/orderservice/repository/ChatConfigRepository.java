package com.ecommerce.orderservice.repository;

import com.ecommerce.orderservice.entity.ChatConfig;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ChatConfigRepository extends JpaRepository<ChatConfig, Integer> {
}
