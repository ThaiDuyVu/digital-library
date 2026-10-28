package vn.edu.huit.digitallibrary.ranking.repository;

import java.util.List;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Repository;
import vn.edu.huit.digitallibrary.ranking.dto.RankingEntry;

@Repository
public class RankingRepository {
    private static final String KEY = "ranking:books";
    private static final DefaultRedisScript<String> RECORD_READ = new DefaultRedisScript<>("""
            local score = redis.call('ZSCORE', KEYS[1], ARGV[1]) or '0'
            if redis.call('SET', KEYS[2], '1', 'NX', 'EX', 60) then
                score = redis.call('ZINCRBY', KEYS[1], 1, ARGV[1])
            end
            return score
            """, String.class);
    private final StringRedisTemplate redis;

    public RankingRepository(StringRedisTemplate redis) {
        this.redis = redis;
    }

    public RankingEntry increment(String bookId, String userId, int chapterNo) {
        // The lock and increment run atomically; reading ZSCORE first rejects a wrong key type before SET.
        String score = redis.execute(RECORD_READ, List.of(KEY, "read-lock:" + userId + ":" + bookId + ":" + chapterNo), bookId);
        if (score == null) {
            throw new IllegalStateException("ZINCRBY did not return a score");
        }
        return new RankingEntry(bookId, Double.parseDouble(score));
    }

    public void remove(String bookId) {
        redis.opsForZSet().remove(KEY, bookId);
    }

    public List<RankingEntry> top(int count) {
        var entries = redis.opsForZSet().reverseRangeWithScores(KEY, 0, count - 1L);
        if (entries == null) {
            return List.of();
        }
        return entries.stream().map(entry -> new RankingEntry(entry.getValue(), entry.getScore())).toList();
    }
}
