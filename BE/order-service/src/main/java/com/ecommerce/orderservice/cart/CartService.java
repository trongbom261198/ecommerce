package com.ecommerce.orderservice.cart;

import com.ecommerce.common.exception.BusinessException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CartService {

    private static final String CART_KEY_PREFIX = "cart:";
    private static final Duration CART_TTL = Duration.ofDays(7);

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    public Cart getCart(String userId) {
        String json = redisTemplate.opsForValue().get(cartKey(userId));
        if (json == null) {
            return emptyCart(userId);
        }
        try {
            Cart cart = objectMapper.readValue(json, Cart.class);
            if (cart.getItems() == null) {
                cart.setItems(new ArrayList<>());
            }
            return cart;
        } catch (JsonProcessingException e) {
            log.warn("Failed to deserialize cart for user {}, returning empty cart", userId, e);
            return emptyCart(userId);
        }
    }

    public Cart addItem(String userId, CartItem newItem) {
        Cart cart = getCart(userId);
        List<CartItem> items = cart.getItems();

        boolean found = false;
        for (CartItem existing : items) {
            if (existing.getSkuId().equals(newItem.getSkuId())) {
                existing.setQuantity(existing.getQuantity() + newItem.getQuantity());
                found = true;
                break;
            }
        }
        if (!found) {
            items.add(newItem);
        }

        cart.setUpdatedAt(LocalDateTime.now());
        persist(userId, cart);
        return cart;
    }

    public Cart updateItemQuantity(String userId, String skuId, int quantity) {
        Cart cart = getCart(userId);
        List<CartItem> items = cart.getItems();

        if (quantity <= 0) {
            items.removeIf(item -> item.getSkuId().equals(skuId));
        } else {
            items.stream()
                    .filter(item -> item.getSkuId().equals(skuId))
                    .findFirst()
                    .ifPresent(item -> item.setQuantity(quantity));
        }

        cart.setUpdatedAt(LocalDateTime.now());
        persist(userId, cart);
        return cart;
    }

    public Cart removeItem(String userId, String skuId) {
        Cart cart = getCart(userId);
        cart.getItems().removeIf(item -> item.getSkuId().equals(skuId));
        cart.setUpdatedAt(LocalDateTime.now());
        persist(userId, cart);
        return cart;
    }

    public void clearCart(String userId) {
        redisTemplate.delete(cartKey(userId));
    }

    /**
     * Returns the cart for checkout; throws if it is empty.
     */
    public Cart getCartForCheckout(String userId) {
        Cart cart = getCart(userId);
        if (cart.getItems().isEmpty()) {
            throw new BusinessException(400, "CART_EMPTY", "Cart is empty. Add items before checking out.");
        }
        return cart;
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private String cartKey(String userId) {
        return CART_KEY_PREFIX + userId;
    }

    private Cart emptyCart(String userId) {
        return Cart.builder()
                .userId(userId)
                .items(new ArrayList<>())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    private void persist(String userId, Cart cart) {
        try {
            String json = objectMapper.writeValueAsString(cart);
            redisTemplate.opsForValue().set(cartKey(userId), json, CART_TTL);
        } catch (JsonProcessingException e) {
            log.error("Failed to persist cart for user {}", userId, e);
            throw new BusinessException(500, "CART_PERSIST_FAILED", "Failed to update cart.");
        }
    }
}
