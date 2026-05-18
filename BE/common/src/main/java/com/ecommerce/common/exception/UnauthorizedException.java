package com.ecommerce.common.exception;

/**
 * Thrown when a request lacks valid authentication credentials (HTTP 401).
 */
public class UnauthorizedException extends BusinessException {

    private static final int HTTP_STATUS = 401;
    private static final String DEFAULT_ERROR_CODE = "UNAUTHORIZED";

    public UnauthorizedException(String message) {
        super(HTTP_STATUS, DEFAULT_ERROR_CODE, message);
    }

    public UnauthorizedException(String errorCode, String message) {
        super(HTTP_STATUS, errorCode, message);
    }

    public UnauthorizedException(String message, Throwable cause) {
        super(HTTP_STATUS, DEFAULT_ERROR_CODE, message, cause);
    }
}
