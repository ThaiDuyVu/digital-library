package vn.edu.huit.digitallibrary.identity.service;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import vn.edu.huit.digitallibrary.identity.dto.UpdateUserRequest;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.identity.model.User;
import vn.edu.huit.digitallibrary.identity.repository.UserRepository;

/**
 * Khóa phiên là `user-sessions:{userId}`, nên thu hồi phải dùng id chuẩn của document.
 * Nếu lấy userId thô trên URL thì đổi mật khẩu qua biến thể hex hoa sẽ không thu hồi được phiên nào.
 */
class UserServiceTest {

    private static final String ID = "6ae1727f39253d94030cffa3";

    private UserRepository users;
    private SessionService sessions;
    private UserService service;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        sessions = mock(SessionService.class);
        service = new UserService(users, sessions, mock(ApplicationEventPublisher.class));

        User stored = new User();
        stored.setId(ID);
        stored.setUsername("reader");
        stored.setEmail("reader@example.com");
        stored.setPasswordHash("$2a$10$0123456789012345678901");
        stored.setRole(Role.USER);
        stored.setCreatedAt(Instant.EPOCH);
        given(users.findById(ID)).willReturn(Optional.of(stored));
        given(users.findById(ID.toUpperCase())).willReturn(Optional.of(stored));
        given(users.save(any(User.class))).willAnswer(call -> call.getArgument(0));
    }

    @Test
    void passwordChangeRevokesSessionsUnderCanonicalIdEvenWhenUrlUsesUpperCaseHex() {
        service.update(ID.toUpperCase(), new UpdateUserRequest(null, null, "matkhaumoi"));

        verify(sessions).revokeAll(ID);
        verify(sessions, never()).revokeAll(ID.toUpperCase());
    }

    @Test
    void updateWithoutPasswordKeepsSessions() {
        service.update(ID, new UpdateUserRequest(null, "Tên Mới", null));

        verify(sessions, never()).revokeAll(any());
    }

    @Test
    void deleteRevokesSessionsUnderCanonicalId() {
        service.delete(ID.toUpperCase());

        verify(sessions).revokeAll(ID);
    }
}
