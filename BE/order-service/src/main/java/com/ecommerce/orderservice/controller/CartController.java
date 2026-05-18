package com.ecommerce.orderservice.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.orderservice.cart.Cart;
import com.ecommerce.orderservice.cart.CartItem;
import com.ecommerce.orderservice.cart.CartService;
import com.ecommerce.orderservice.dto.CartItemUpdateRequest;
import com.ecommerce.orderservice.dto.CartRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/cart")
@RequiredArgsConstructor
@Tag(name = "Cart", description = "Shopping cart endpoints")
public class CartController {

    private final CartService cartService;

    @GetMapping
    @Operation(summary = "Get the current user's cart")
    public ResponseEntity<ApiResponse<Cart>> getCart(
            @RequestHeader("X-User-Id") String userId) {

        Cart cart = cartService.getCart(userId);
        return ResponseEntity.ok(ApiResponse.ok(cart));
    }

    @PostMapping("/items")
    @Operation(summary = "Add an item to the cart")
    public ResponseEntity<ApiResponse<Cart>> addItem(
            @Valid @RequestBody CartRequest request,
            @RequestHeader("X-User-Id") String userId) {

        CartItem item = CartItem.builder()
                .skuId(request.getSkuId())
                .productId(request.getProductId())
                .productName(request.getProductName())
                .skuCode(request.getSkuCode())
                .variantName(request.getVariantName())
                .quantity(request.getQuantity())
                .unitPrice(request.getUnitPrice())
                .images(request.getImages())
                .build();

        Cart cart = cartService.addItem(userId, item);
        return ResponseEntity.ok(ApiResponse.ok("Item added to cart", cart));
    }

    @PutMapping("/items/{skuId}")
    @Operation(summary = "Update the quantity of a cart item (0 removes the item)")
    public ResponseEntity<ApiResponse<Cart>> updateItemQuantity(
            @PathVariable String skuId,
            @Valid @RequestBody CartItemUpdateRequest request,
            @RequestHeader("X-User-Id") String userId) {

        Cart cart = cartService.updateItemQuantity(userId, skuId, request.getQuantity());
        return ResponseEntity.ok(ApiResponse.ok("Cart updated", cart));
    }

    @DeleteMapping("/items/{skuId}")
    @Operation(summary = "Remove an item from the cart")
    public ResponseEntity<ApiResponse<Cart>> removeItem(
            @PathVariable String skuId,
            @RequestHeader("X-User-Id") String userId) {

        Cart cart = cartService.removeItem(userId, skuId);
        return ResponseEntity.ok(ApiResponse.ok("Item removed from cart", cart));
    }

    @DeleteMapping
    @Operation(summary = "Clear the entire cart")
    public ResponseEntity<ApiResponse<Void>> clearCart(
            @RequestHeader("X-User-Id") String userId) {

        cartService.clearCart(userId);
        return ResponseEntity.ok(ApiResponse.okMessage("Cart cleared"));
    }
}
