package vn.edu.huit.digitallibrary.suggestion.model;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

/** _id chính là userId: MongoDB bảo đảm một đề xuất/tài khoản, kể cả gửi đồng thời. */
@Document(BookSuggestion.COLLECTION)
public record BookSuggestion(
        @Id String id,
        String username,
        String description,
        Instant createdAt,
        String reply,
        Instant repliedAt,
        String repliedBy) {

    public static final String COLLECTION = "book_suggestions";
}
