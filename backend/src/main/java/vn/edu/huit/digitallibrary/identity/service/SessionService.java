package vn.edu.huit.digitallibrary.identity.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * Phiên đăng nhập lưu trong Redis vì là dữ liệu tạm có hạn dùng.
 *
 * <ul>
 *   <li>{@code session:{sha256(token)}} – String, giá trị là userId, có TTL.</li>
 *   <li>{@code user-sessions:{userId}} – Set các sha256(token) để thu hồi mọi phiên của một người dùng.</li>
 * </ul>
 * Chỉ lưu băm của token nên đọc Redis Insight không lấy được token đăng nhập.
 */
@Service
public class SessionService {

    private static final String SESSION_PREFIX = "session:";
    private static final String USER_SESSIONS_PREFIX = "user-sessions:";

    private final SecureRandom random = new SecureRandom();
    private final StringRedisTemplate redis;
    private final Duration ttl;

    public SessionService(StringRedisTemplate redis, @Value("${app.auth.session-ttl:7d}") Duration ttl) {
        this.redis = redis;
        this.ttl = ttl;
    }

    public record Session(String token, Instant expiresAt) {
    }

    public Session create(String userId) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String digest = digest(token);
        redis.opsForValue().set(SESSION_PREFIX + digest, userId, ttl);
        redis.opsForSet().add(USER_SESSIONS_PREFIX + userId, digest);
        redis.expire(USER_SESSIONS_PREFIX + userId, ttl);
        return new Session(token, Instant.now().plus(ttl));
    }

    public Optional<String> resolveUserId(String token) {
        return Optional.ofNullable(redis.opsForValue().get(SESSION_PREFIX + digest(token)));
    }

    public void revoke(String token) {
        String digest = digest(token);
        String userId = redis.opsForValue().getAndDelete(SESSION_PREFIX + digest);
        if (userId != null) {
            redis.opsForSet().remove(USER_SESSIONS_PREFIX + userId, digest);
        }
    }

    public void revokeAll(String userId) {
        Set<String> digests = redis.opsForSet().members(USER_SESSIONS_PREFIX + userId);
        if (digests != null && !digests.isEmpty()) {
            redis.delete(digests.stream().map(digest -> SESSION_PREFIX + digest).toList());
        }
        redis.delete(USER_SESSIONS_PREFIX + userId);
    }

    private static String digest(String token) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
