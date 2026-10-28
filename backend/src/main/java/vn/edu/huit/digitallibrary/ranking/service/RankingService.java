package vn.edu.huit.digitallibrary.ranking.service;

import java.util.List;
import org.bson.types.ObjectId;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import vn.edu.huit.digitallibrary.catalog.event.BookDeletedEvent;
import vn.edu.huit.digitallibrary.catalog.service.BookService;
import vn.edu.huit.digitallibrary.common.ApiException;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.ranking.dto.RankingEntry;
import vn.edu.huit.digitallibrary.ranking.repository.RankingRepository;

@Service
public class RankingService {
    private static final Logger log = LoggerFactory.getLogger(RankingService.class);
    private final RankingRepository ranking;
    private final BookService books;

    public RankingService(RankingRepository ranking, BookService books) {
        this.ranking = ranking;
        this.books = books;
    }

    public RankingEntry recordRead(String bookId, int chapterNo, CurrentUser currentUser) {
        if (chapterNo < 1) {
            throw ApiException.badRequest("chapterNo phải từ 1 trở lên");
        }
        bookId = canonicalId(bookId);
        if (!books.exists(bookId)) {
            throw ApiException.notFound("Không tìm thấy sách " + bookId);
        }
        books.getChapter(bookId, chapterNo);
        return ranking.increment(bookId, canonicalId(currentUser.id()), chapterNo);
    }

    public List<RankingEntry> top(int count) {
        if (count < 1 || count > 100) {
            throw ApiException.badRequest("top phải trong khoảng 1..100");
        }
        // Normalize the read DTO too, without modifying or silently merging legacy Redis members.
        return ranking.top(count).stream()
                .map(entry -> new RankingEntry(canonicalId(entry.bookId()), entry.score())).toList();
    }

    /** Sách đã xóa không còn chiếm chỗ trong Top N. MongoDB đã xóa xong nên lỗi Redis chỉ ghi log. */
    @EventListener
    public void onBookDeleted(BookDeletedEvent event) {
        try {
            ranking.remove(event.bookId());
        } catch (DataAccessException ex) {
            log.warn("Không xóa được sách {} khỏi ranking:books", event.bookId(), ex);
        }
    }

    private static String canonicalId(String id) {
        return ObjectId.isValid(id) ? new ObjectId(id).toHexString() : id;
    }
}
