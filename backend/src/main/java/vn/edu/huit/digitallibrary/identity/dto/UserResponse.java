package vn.edu.huit.digitallibrary.identity.dto;

import java.time.Instant;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.identity.model.User;

/** Không bao giờ chứa passwordHash. */
public record UserResponse(String id, String username, String email, String fullName, Role role, Instant createdAt) {

    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getUsername(), user.getEmail(), user.getFullName(),
                user.getRole(), user.getCreatedAt());
    }
}
