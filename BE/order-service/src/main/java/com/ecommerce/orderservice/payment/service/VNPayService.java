package com.ecommerce.orderservice.payment.service;

import com.ecommerce.common.exception.NotFoundException;
import com.ecommerce.common.exception.UnauthorizedException;
import com.ecommerce.orderservice.email.EmailService;
import com.ecommerce.orderservice.entity.Order;
import com.ecommerce.orderservice.entity.PaymentStatus;
import com.ecommerce.orderservice.payment.config.VNPayProperties;
import com.ecommerce.orderservice.payment.dto.CreatePaymentResponse;
import com.ecommerce.orderservice.payment.dto.IpnResponse;
import com.ecommerce.orderservice.payment.entity.Payment;
import com.ecommerce.orderservice.payment.entity.PaymentRecordStatus;
import com.ecommerce.orderservice.payment.repository.PaymentRepository;
import com.ecommerce.orderservice.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class VNPayService {

    private static final DateTimeFormatter VNP_DATE_FMT =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final ZoneId VN_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private final OrderRepository orderRepository;
    private final PaymentRepository paymentRepository;
    private final VNPayProperties props;
    private final VNPaySignatureUtil signatureUtil;
    private final EmailService emailService;

    /**
     * Creates a VNPay payment URL for the given order.
     * Persists a PENDING Payment record before returning the redirect URL.
     */
    @Transactional
    public CreatePaymentResponse createPaymentUrl(UUID orderId, UUID userId, String clientIp) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new NotFoundException("Order not found: " + orderId));

        if (!order.getUserId().equals(userId)) {
            throw new UnauthorizedException("You do not own this order");
        }

        String vnpTxnRef = order.getOrderNumber() + "-" + System.currentTimeMillis();

        ZonedDateTime now = ZonedDateTime.now(VN_ZONE);
        String createDate = now.format(VNP_DATE_FMT);
        String expireDate = now.plusMinutes(15).format(VNP_DATE_FMT);

        // Amount in VND (no decimals) — multiply by 100 per VNPay spec
        String amount = order.getTotalAmount()
                .multiply(BigDecimal.valueOf(100))
                .toBigInteger()
                .toString();

        // Build params in TreeMap (ascending key order for sign-data consistency)
        TreeMap<String, String> params = new TreeMap<>();
        params.put("vnp_Version", props.getVersion());
        params.put("vnp_Command", props.getCommand());
        params.put("vnp_TmnCode", props.getTmnCode());
        params.put("vnp_Amount", amount);
        params.put("vnp_CurrCode", props.getCurrCode());
        params.put("vnp_TxnRef", vnpTxnRef);
        params.put("vnp_OrderInfo", "Thanh toan don hang " + order.getOrderNumber());
        params.put("vnp_OrderType", "other");
        params.put("vnp_Locale", props.getLocale());
        params.put("vnp_ReturnUrl", props.getReturnUrl());
        params.put("vnp_IpAddr", clientIp);
        params.put("vnp_CreateDate", createDate);
        params.put("vnp_ExpireDate", expireDate);

        String signData = signatureUtil.buildSignData(params);
        // hashSecret must not be logged
        String secureHash = signatureUtil.hmacSHA512(props.getHashSecret(), signData);
        params.put("vnp_SecureHash", secureHash);

        // Build final query string (values URL-encoded)
        StringBuilder query = new StringBuilder();
        for (Map.Entry<String, String> entry : params.entrySet()) {
            if (query.length() > 0) query.append('&');
            query.append(entry.getKey())
                 .append('=')
                 .append(URLEncoder.encode(entry.getValue(), StandardCharsets.US_ASCII));
        }

        // Persist PENDING payment record
        Payment payment = Payment.builder()
                .orderId(orderId)
                .vnpTxnRef(vnpTxnRef)
                .amount(order.getTotalAmount())
                .status(PaymentRecordStatus.PENDING)
                .build();
        paymentRepository.save(payment);

        log.info("VNPay payment created — orderId={}, txnRef={}", orderId, vnpTxnRef);
        return new CreatePaymentResponse(props.getPayUrl() + "?" + query, vnpTxnRef);
    }

    /**
     * Handles VNPay IPN (server-to-server callback).
     * Idempotent: returns "already confirmed" if payment is not PENDING.
     */
    @Transactional
    public IpnResponse handleIpn(Map<String, String> params) {
        if (!signatureUtil.verify(params, props.getHashSecret())) {
            log.warn("VNPay IPN invalid signature — txnRef={}", params.get("vnp_TxnRef"));
            return new IpnResponse("97", "Invalid Signature");
        }

        String txnRef = params.get("vnp_TxnRef");
        Payment payment = paymentRepository.findByVnpTxnRef(txnRef).orElse(null);
        if (payment == null) {
            log.warn("VNPay IPN — payment not found for txnRef={}", txnRef);
            return new IpnResponse("01", "Order Not Found");
        }

        if (payment.getStatus() != PaymentRecordStatus.PENDING) {
            log.info("VNPay IPN — already confirmed for txnRef={}", txnRef);
            return new IpnResponse("02", "Order already confirmed");
        }

        // Validate amount: VNPay sends amount * 100
        String vnpAmountStr = params.get("vnp_Amount");
        try {
            BigDecimal vnpAmount = new BigDecimal(vnpAmountStr);
            BigDecimal expectedAmount = payment.getAmount().multiply(BigDecimal.valueOf(100));
            if (vnpAmount.compareTo(expectedAmount) != 0) {
                log.warn("VNPay IPN amount mismatch — expected={}, received={}", expectedAmount, vnpAmount);
                return new IpnResponse("04", "Invalid Amount");
            }
        } catch (NumberFormatException e) {
            log.warn("VNPay IPN — invalid amount value: {}", vnpAmountStr);
            return new IpnResponse("04", "Invalid Amount");
        }

        // Populate payment fields (never log vnp_SecureHash)
        payment.setVnpResponseCode(params.get("vnp_ResponseCode"));
        payment.setVnpTransactionNo(params.get("vnp_TransactionNo"));
        payment.setVnpBankCode(params.get("vnp_BankCode"));
        payment.setVnpPayDate(params.get("vnp_PayDate"));
        payment.setRawResponse(buildSafeRawResponse(params));

        String responseCode = params.get("vnp_ResponseCode");
        String transactionStatus = params.get("vnp_TransactionStatus");

        Order order = orderRepository.findById(payment.getOrderId())
                .orElseThrow(() -> new NotFoundException("Order not found for payment: " + payment.getOrderId()));

        if ("00".equals(responseCode) && "00".equals(transactionStatus)) {
            payment.setStatus(PaymentRecordStatus.PAID);
            paymentRepository.save(payment);

            order.setPaymentStatus(PaymentStatus.PAID);
            orderRepository.save(order);

            // Send receipt email — guard against null userEmail on older orders
            String userEmail = order.getUserEmail();
            if (userEmail != null && !userEmail.isBlank()) {
                try {
                    emailService.sendPaymentReceipt(
                            userEmail,
                            order.getOrderNumber(),
                            order.getTotalAmount().toPlainString());
                } catch (Exception e) {
                    log.warn("Failed to send payment receipt email for order={}: {}", order.getOrderNumber(), e.getMessage());
                }
            }
            log.info("VNPay IPN — payment PAID for txnRef={}, orderId={}", txnRef, order.getId());
        } else {
            payment.setStatus(PaymentRecordStatus.FAILED);
            paymentRepository.save(payment);

            order.setPaymentStatus(PaymentStatus.FAILED);
            orderRepository.save(order);

            log.info("VNPay IPN — payment FAILED for txnRef={}, responseCode={}", txnRef, responseCode);
        }

        return new IpnResponse("00", "Confirm Success");
    }

    /**
     * Handles VNPay return URL (browser redirect after payment).
     * Verifies signature and returns a result map for the frontend.
     */
    public Map<String, Object> handleReturn(Map<String, String> params) {
        boolean valid = signatureUtil.verify(params, props.getHashSecret());
        String responseCode = params.get("vnp_ResponseCode");
        boolean success = valid && "00".equals(responseCode);
        String message = success ? "Thanh toán thành công" : "Thanh toán thất bại hoặc chữ ký không hợp lệ";
        log.info("VNPay return — txnRef={}, responseCode={}, valid={}", params.get("vnp_TxnRef"), responseCode, valid);
        return Map.of("success", success, "message", message, "txnRef", params.getOrDefault("vnp_TxnRef", ""));
    }

    /**
     * Builds a raw-response string excluding vnp_SecureHash to avoid logging secrets.
     */
    private String buildSafeRawResponse(Map<String, String> params) {
        TreeMap<String, String> safe = new TreeMap<>(params);
        safe.remove("vnp_SecureHash");
        safe.remove("vnp_SecureHashType");
        return safe.toString();
    }
}
