package vn.edu.huit.digitallibrary.catalog.dto;

import java.util.List;
import vn.edu.huit.digitallibrary.catalog.model.Chapter;
import vn.edu.huit.digitallibrary.catalog.model.Section;

public record ChapterContent(
        String bookId,
        String bookTitle,
        int chapterNo,
        String title,
        String content,
        List<Section> sections) {

    public static ChapterContent from(String bookId, String bookTitle, Chapter chapter) {
        return new ChapterContent(bookId, bookTitle, chapter.chapterNo(), chapter.title(), chapter.content(),
                chapter.sections() == null ? List.of() : chapter.sections());
    }
}
