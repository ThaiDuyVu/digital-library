package vn.edu.huit.digitallibrary.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import vn.edu.huit.digitallibrary.identity.model.Role;

/**
 * ID hợp lệ được chuẩn hóa về ObjectId hex thường trước khi so quyền (invariant trong docs/SHARED.md),
 * nên chính chủ dùng biến thể hex hoa vẫn truy cập đúng tài nguyên của mình.
 */
class CurrentUserTest {

    private static final String ID = "6ae1727f39253d94030cffa3";
    private final CurrentUser owner = new CurrentUser(ID, "reader", Role.USER);

    @Test
    void ownerAccessesOwnResourceThroughAnyHexCase() {
        assertThat(owner.canAccess(ID)).isTrue();
        assertThat(owner.canAccess(ID.toUpperCase())).isTrue();
    }

    @Test
    void ownerCannotAccessAnotherUser() {
        assertThat(owner.canAccess("6ae1727f39253d94030cffa2")).isFalse();
        assertThat(owner.canAccess("6AE1727F39253D94030CFFA2")).isFalse();
    }

    @Test
    void invalidIdStaysUntouchedSoLookupKeepsReturning404() {
        assertThat(owner.canAccess("khong-phai-objectid")).isFalse();
    }

    @Test
    void adminAccessesEveryUser() {
        CurrentUser admin = new CurrentUser("6ae1727f39253d94030cffa1", "admin", Role.ADMIN);
        assertThat(admin.canAccess("6ae1727f39253d94030cffa2")).isTrue();
        assertThat(admin.canAccess("khong-phai-objectid")).isTrue();
    }
}
