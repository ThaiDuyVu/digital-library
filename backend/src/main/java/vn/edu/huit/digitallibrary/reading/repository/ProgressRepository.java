package vn.edu.huit.digitallibrary.reading.repository;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.Optional;
import org.springframework.data.redis.core.Cursor;
import org.springframework.data.redis.core.ScanOptions;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;
import vn.edu.huit.digitallibrary.reading.dto.ProgressResponse;
import vn.edu.huit.digitallibrary.reading.dto.ProgressEntry;

@Repository
public class ProgressRepository {
    private final StringRedisTemplate redis;

    public ProgressRepository(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public void save(String userId, String bookId, ProgressResponse progress) {
        // One HSET updates the complete position atomically; no TTL in the demo.
        redis.opsForHash().putAll(key(userId, bookId), Map.of(
                "chapter", Integer.toString(progress.chapter()),
                "page", Integer.toString(progress.page()),
                "line", Integer.toString(progress.line()),
                "updatedAt", progress.updatedAt().toString()));
    }

    public Optional<ProgressResponse> find(String userId, String bookId) {
        Map<Object, Object> fields = redis.opsForHash().entries(key(userId, bookId));
        if (fields.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new ProgressResponse(
                Integer.parseInt((String) fields.get("chapter")),
                Integer.parseInt((String) fields.get("page")),
                Integer.parseInt((String) fields.get("line")),
                Instant.parse((String) fields.get("updatedAt"))));
    }

    public List<ProgressEntry> findByUser(String userId) {
        String prefix = "progress:" + userId + ":";
        Map<String, ProgressEntry> entries = new LinkedHashMap<>();
        try (Cursor<String> cursor = redis.scan(ScanOptions.scanOptions().match(prefix + "*").count(100).build())) {
            while (cursor.hasNext()) {
                String bookId = cursor.next().substring(prefix.length());
                // SCAN may repeat keys; a Hash deleted during traversal is simply absent.
                find(userId, bookId).ifPresent(value -> entries.put(bookId, new ProgressEntry(
                        bookId, value.chapter(), value.page(), value.line(), value.updatedAt())));
            }
        }
        return new ArrayList<>(entries.values());
    }

    public long deleteByUser(String userId) {
        return deleteMatching("progress:" + userId + ":*");
    }

    public long deleteByBook(String bookId) {
        return deleteMatching("progress:*:" + bookId);
    }

    private long deleteMatching(String pattern) {
        // SCAN thay vì KEYS để không chặn Redis khi có nhiều key
        List<String> keys = new ArrayList<>();
        try (Cursor<String> cursor = redis.scan(ScanOptions.scanOptions().match(pattern).count(500).build())) {
            cursor.forEachRemaining(keys::add);
        }
        Long deleted = keys.isEmpty() ? null : redis.delete(keys);
        return deleted == null ? 0 : deleted;
    }

    private String key(String userId, String bookId) {
        return "progress:" + userId + ":" + bookId;
    }
}
