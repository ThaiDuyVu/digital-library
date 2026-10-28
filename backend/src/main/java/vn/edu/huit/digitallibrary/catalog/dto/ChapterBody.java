package vn.edu.huit.digitallibrary.catalog.dto;

import java.util.List;
import vn.edu.huit.digitallibrary.catalog.model.Chapter;
import vn.edu.huit.digitallibrary.catalog.model.Section;

/** Một chương kèm toàn văn, dùng trong {@link BookContent}; không lặp lại bookId vì đã nằm trong sách. */
public record ChapterBody(int chapterNo, String title, String content, List<Section> sections) {

    public static ChapterBody from(Chapter chapter) {
        return new ChapterBody(chapter.chapterNo(), chapter.title(), chapter.content(),
                chapter.sections() == null ? List.of() : chapter.sections());
    }
}
