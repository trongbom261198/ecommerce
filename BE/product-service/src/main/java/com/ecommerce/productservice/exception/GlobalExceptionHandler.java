package com.ecommerce.productservice.exception;

import com.ecommerce.common.dto.ApiResponse;
import com.ecommerce.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

//    @ExceptionHandler(BusinessException.class)
//    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException ex) {
//        log.warn("BusinessException: [{}] {}", ex.getErrorCode(), ex.getMessage());
//        return ResponseEntity
//                .status(ex.getHttpStatus())
//                .body(ApiResponse.error(ex.getErrorCode(), ex.getMessage()));
//    }
//
//    @ExceptionHandler(MethodArgumentNotValidException.class)
//    public ResponseEntity<ApiResponse<Void>> handleValidationException(MethodArgumentNotValidException ex) {
//        List<ApiResponse.FieldError> fieldErrors = ex.getBindingResult().getFieldErrors().stream()
//                .map(fe -> ApiResponse.FieldError.builder()
//                        .field(fe.getField())
//                        .message(fe.getDefaultMessage())
//                        .build())
//                .toList();
//        return ResponseEntity
//                .status(HttpStatus.BAD_REQUEST)
//                .body(ApiResponse.error("VALIDATION_ERROR", "Request validation failed", fieldErrors));
//    }
//
//    @ExceptionHandler(Exception.class)
//    public ResponseEntity<ApiResponse<Void>> handleGenericException(Exception ex) {
//        log.error("Unexpected error", ex);
//        return ResponseEntity
//                .status(HttpStatus.INTERNAL_SERVER_ERROR)
//                .body(ApiResponse.error("INTERNAL_ERROR", "An unexpected error occurred"));
//    }
}
