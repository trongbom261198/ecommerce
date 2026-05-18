package com.ecommerce.orderservice.payment.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.TreeMap;

@Slf4j
@Component
public class VNPaySignatureUtil {

    /**
     * Computes HMAC-SHA512 of {@code data} using {@code key}, returns uppercase hex string.
     * Never logs key or output — callers must not log the return value.
     */
    public String hmacSHA512(String key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA512");
            SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA512");
            mac.init(secretKey);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                sb.append(String.format("%02X", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to compute HMAC-SHA512", e);
        }
    }

    /**
     * Builds the canonical sign-data string from all params except vnp_SecureHash / vnp_SecureHashType.
     * Keys are sorted ascending (TreeMap); values are URL-encoded with US-ASCII.
     */
    public String buildSignData(Map<String, String> params) {
        TreeMap<String, String> sorted = new TreeMap<>(params);
        sorted.remove("vnp_SecureHash");
        sorted.remove("vnp_SecureHashType");

        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : sorted.entrySet()) {
            if (sb.length() > 0) sb.append('&');
            sb.append(entry.getKey())
              .append('=')
              .append(URLEncoder.encode(entry.getValue(), StandardCharsets.US_ASCII));
        }
        return sb.toString();
    }

    /**
     * Verifies that vnp_SecureHash in {@code params} matches the HMAC computed from the remaining params.
     */
    public boolean verify(Map<String, String> params, String secret) {
        String receivedHash = params.get("vnp_SecureHash");
        if (receivedHash == null || receivedHash.isBlank()) {
            return false;
        }
        String signData = buildSignData(params);
        String computedHash = hmacSHA512(secret, signData);
        return computedHash.equalsIgnoreCase(receivedHash);
    }
}
