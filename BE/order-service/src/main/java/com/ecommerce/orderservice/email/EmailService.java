package com.ecommerce.orderservice.email;

import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;
    private final MailProperties props;

    @Async
    public void sendHtml(String to, String subject, String htmlBody) {
        if (!props.isEnabled()) return;
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(props.getFrom(), props.getFromName());
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(msg);
            log.info("Email sent to {}: {}", to, subject);
        } catch (Exception e) {
            log.warn("Failed to send email to {}: {}", to, e.getMessage());
        }
    }

    public void sendOrderConfirmation(String to, String orderNumber, String totalAmount) {
        sendHtml(to, "Đơn hàng #" + orderNumber + " đã được xác nhận",
                EmailTemplates.orderConfirmedHtml(orderNumber, totalAmount));
    }

    public void sendOrderShipped(String to, String orderNumber, String trackingNumber) {
        sendHtml(to, "Đơn hàng #" + orderNumber + " đã được giao đi",
                EmailTemplates.orderShippedHtml(orderNumber, trackingNumber));
    }

    public void sendPaymentReceipt(String to, String orderNumber, String totalAmount) {
        sendHtml(to, "Xác nhận thanh toán đơn hàng #" + orderNumber,
                EmailTemplates.paymentReceiptHtml(orderNumber, totalAmount));
    }
}
