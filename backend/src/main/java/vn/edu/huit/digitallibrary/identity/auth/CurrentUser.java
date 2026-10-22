package vn.edu.huit.digitallibrary.identity.auth;

import vn.edu.huit.digitallibrary.identity.model.Role;

/**
 * Người dùng đã xác thực của request hiện tại. Khai báo làm tham số controller trong method có
 * {@link Authenticated} hoặc {@link AdminOnly} để nhận userId đáng tin thay vì userId từ trình duyệt.
 */
public record CurrentUser(String id, String username, Role role) {

    public boolean isAdmin() {
        return role == Role.ADMIN;
    }

    /** Chủ tài khoản hoặc quản trị viên mới được thao tác tài nguyên của userId. */
    public boolean canAccess(String userId) {
        return isAdmin() || id.equals(userId);
    }
}
