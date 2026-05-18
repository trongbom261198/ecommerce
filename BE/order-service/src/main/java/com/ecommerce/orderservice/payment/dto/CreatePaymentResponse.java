package com.ecommerce.orderservice.payment.dto;

public record CreatePaymentResponse(String paymentUrl, String vnpTxnRef) {}
