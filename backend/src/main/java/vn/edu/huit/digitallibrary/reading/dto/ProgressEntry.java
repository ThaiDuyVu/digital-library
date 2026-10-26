package vn.edu.huit.digitallibrary.reading.dto;

import java.time.Instant;

public record ProgressEntry(String bookId, int chapter, int page, int line, Instant updatedAt) {
}
