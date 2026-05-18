package com.ecommerce.orderservice.payment.controller;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.orderservice.payment.dto.CreatePaymentRequest;
import com.ecommerce.orderservice.payment.dto.CreatePaymentResponse;
import com.ecommerce.orderservice.payment.dto.IpnResponse;
import com.ecommerce.orderservice.payment.service.VNPayService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final VNPayService vnPayService;

    @PostMapping("/vnpay/create")
    public ResponseEntity<ApiResponse<CreatePaymentResponse>> create(
            @Valid @RequestBody CreatePaymentRequest req,
            @RequestHeader("X-User-Id") String userId,
            HttpServletRequest request) {

        String ip = Optional.ofNullable(request.getHeader("X-Forwarded-For"))
                .filter(h -> !h.isBlank())
                .orElse(request.getRemoteAddr());

        CreatePaymentResponse res = vnPayService.createPaymentUrl(
                req.orderId(), UUID.fromString(userId), ip);

        return ResponseEntity.ok(ApiResponse.ok(res));
    }

    @GetMapping("/vnpay/return")
    public ResponseEntity<ApiResponse<Map<String, Object>>> returnUrl(
            @RequestParam Map<String, String> params) {
        return ResponseEntity.ok(ApiResponse.ok(vnPayService.handleReturn(params)));
    }

    /**
     * VNPay IPN — called server-to-server by VNPay (no JWT, must be in public-paths).
     * Returns IpnResponse JSON directly (not wrapped in ApiResponse) per VNPay spec.
     */
    @PostMapping("/vnpay/ipn")
    public ResponseEntity<IpnResponse> ipn(@RequestParam Map<String, String> params) {
        return ResponseEntity.ok(vnPayService.handleIpn(params));
    }
}
