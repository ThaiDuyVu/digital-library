package vn.edu.huit.digitallibrary.catalog.dto;

import java.time.Instant;
import java.util.List;
import vn.edu.huit.digitallibrary.catalog.model.Book;

/** Thông tin sách không kèm nội dung chương, dùng cho danh sách và bảng xếp hạng. */
public record BookSummary(
        String id,
        String title,
        String author,
        List<String> categories,
        String description,
        String coverUrl,
        int chapterCount,
        Instant createdAt) {

    public static BookSummary from(Book book) {
        return new BookSummary(book.getId(), book.getTitle(), book.getAuthor(), book.getCategories(),
                book.getDescription(), book.getCoverUrl(), book.getChapters().size(), book.getCreatedAt());
    }
}
