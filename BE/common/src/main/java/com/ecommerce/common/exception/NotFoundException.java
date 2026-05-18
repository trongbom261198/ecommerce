package com.ecommerce.common.exception;

/**
 * Thrown when a requested resource cannot be found (HTTP 404).
 */
public class NotFoundException extends BusinessException {

    private static final int HTTP_STATUS = 404;
    private static final String DEFAULT_ERROR_CODE = "NOT_FOUND";

    public NotFoundException(String message) {
        super(HTTP_STATUS, DEFAULT_ERROR_CODE, message);
    }

    public NotFoundException(String errorCode, String message) {
        super(HTTP_STATUS, errorCode, message);
    }

    public NotFoundException(String message, Throwable cause) {
        super(HTTP_STATUS, DEFAULT_ERROR_CODE, message, cause);
    }
}
