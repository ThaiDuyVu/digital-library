package vn.edu.huit.digitallibrary.catalog.dto;

import java.time.Instant;
import java.util.List;
import vn.edu.huit.digitallibrary.catalog.model.Book;

/** Chi tiết sách kèm mục lục; nội dung từng chương lấy qua GET /api/books/{bookId}/chapters/{chapterNo}. */
public record BookDetail(
        String id,
        String title,
        String author,
        List<String> categories,
        String description,
        String coverUrl,
        List<ChapterSummary> chapters,
        Instant createdAt,
        Instant updatedAt) {

    public static BookDetail from(Book book) {
        return new BookDetail(book.getId(), book.getTitle(), book.getAuthor(), book.getCategories(),
                book.getDescription(), book.getCoverUrl(),
                book.getChapters().stream().map(ChapterSummary::from).toList(),
                book.getCreatedAt(), book.getUpdatedAt());
    }
}
