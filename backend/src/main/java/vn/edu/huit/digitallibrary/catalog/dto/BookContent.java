package vn.edu.huit.digitallibrary.catalog.dto;

import java.util.List;
import vn.edu.huit.digitallibrary.catalog.model.Book;

/**
 * Toàn văn cả cuốn sách trong một lần gọi.
 *
 * <p>E-Reader đánh số trang liên tục trên toàn sách (kịch bản demo yêu cầu đọc tới "Trang 30"),
 * nên phải biết nội dung mọi chương mới tính được tổng số trang và vị trí từng chương.
 * {@code GET /api/books/{bookId}} cố ý cắt toàn văn để danh sách nhẹ, vì vậy cần endpoint riêng.
 */
public record BookContent(
        String id,
        String title,
        String author,
        List<String> categories,
        List<ChapterBody> chapters) {

    public static BookContent from(Book book) {
        return new BookContent(book.getId(), book.getTitle(), book.getAuthor(), book.getCategories(),
                book.getChapters().stream().map(ChapterBody::from).toList());
    }
}
