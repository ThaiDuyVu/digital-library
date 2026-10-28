package vn.edu.huit.digitallibrary.identity.service;

import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import org.bson.types.ObjectId;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import vn.edu.huit.digitallibrary.common.ApiException;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.identity.dto.LoginRequest;
import vn.edu.huit.digitallibrary.identity.dto.LoginResponse;
import vn.edu.huit.digitallibrary.identity.dto.RegisterRequest;
import vn.edu.huit.digitallibrary.identity.dto.UpdateUserRequest;
import vn.edu.huit.digitallibrary.identity.dto.UserResponse;
import vn.edu.huit.digitallibrary.identity.event.UserDeletedEvent;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.identity.model.User;
import vn.edu.huit.digitallibrary.identity.repository.UserRepository;

@Service
public class UserService {

    private final UserRepository users;
    private final SessionService sessions;
    private final ApplicationEventPublisher events;
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public UserService(UserRepository users, SessionService sessions, ApplicationEventPublisher events) {
        this.users = users;
        this.sessions = sessions;
        this.events = events;
    }

    public UserResponse register(RegisterRequest request) {
        return UserResponse.from(createUser(request, Role.USER));
    }

    public UserResponse createAdmin(String username, String email, String password) {
        return UserResponse.from(createUser(new RegisterRequest(username, email, password, "Quản trị viên"), Role.ADMIN));
    }

    private User createUser(RegisterRequest request, Role role) {
        String username = normalize(request.username());
        String email = normalize(request.email());
        if (users.existsByUsername(username)) {
            throw ApiException.conflict("Tên đăng nhập đã được sử dụng");
        }
        if (users.existsByEmail(email)) {
            throw ApiException.conflict("Email đã được sử dụng");
        }
        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setFullName(StringUtils.hasText(request.fullName()) ? request.fullName().trim() : null);
        user.setRole(role);
        Instant now = Instant.now();
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        return users.insert(user);
    }

    public LoginResponse login(LoginRequest request) {
        User user = users.findByUsername(normalize(request.username()))
                .filter(found -> passwordEncoder.matches(request.password(), found.getPasswordHash()))
                .orElseThrow(() -> ApiException.unauthorized("Sai tên đăng nhập hoặc mật khẩu"));
        SessionService.Session session = sessions.create(user.getId());
        return new LoginResponse(session.token(), "Bearer", session.expiresAt(), UserResponse.from(user));
    }

    public void logout(String token) {
        sessions.revoke(token);
    }

    /** Xác thực token cho AuthInterceptor; đọc lại user từ MongoDB để role và việc xóa tài khoản có hiệu lực ngay. */
    public Optional<CurrentUser> authenticate(String token) {
        return sessions.resolveUserId(token)
                .flatMap(users::findById)
                .map(user -> new CurrentUser(user.getId(), user.getUsername(), user.getRole()));
    }

    public UserResponse get(String userId) {
        return UserResponse.from(find(userId));
    }

    public UserResponse update(String userId, UpdateUserRequest request) {
        User user = find(userId);
        if (request.email() != null) {
            String email = normalize(request.email());
            if (!email.equals(user.getEmail()) && users.existsByEmail(email)) {
                throw ApiException.conflict("Email đã được sử dụng");
            }
            user.setEmail(email);
        }
        if (request.fullName() != null) {
            user.setFullName(StringUtils.hasText(request.fullName()) ? request.fullName().trim() : null);
        }
        boolean passwordChanged = request.password() != null;
        if (passwordChanged) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }
        user.setUpdatedAt(Instant.now());
        User saved = users.save(user);
        if (passwordChanged) {
            // Khóa phiên dùng id chuẩn của document: userId trên URL có thể là biến thể hex hoa.
            sessions.revokeAll(saved.getId());
        }
        return UserResponse.from(saved);
    }

    public void delete(String userId) {
        User user = find(userId);
        if (user.getRole() == Role.ADMIN && users.countByRole(Role.ADMIN) <= 1) {
            throw ApiException.conflict("Không thể xóa quản trị viên cuối cùng");
        }
        users.delete(user);
        sessions.revokeAll(user.getId());
        events.publishEvent(new UserDeletedEvent(user.getId()));
    }

    private User find(String userId) {
        return Optional.of(userId)
                .filter(ObjectId::isValid)
                .flatMap(users::findById)
                .orElseThrow(() -> ApiException.notFound("Không tìm thấy độc giả " + userId));
    }

    private static String normalize(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }
}
