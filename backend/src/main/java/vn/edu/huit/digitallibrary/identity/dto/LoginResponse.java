package vn.edu.huit.digitallibrary.identity.dto;

import java.time.Instant;

public record LoginResponse(String token, String tokenType, Instant expiresAt, UserResponse user) {
}
