package vn.edu.huit.digitallibrary.catalog.dto;

import java.util.List;
import vn.edu.huit.digitallibrary.catalog.model.Chapter;
import vn.edu.huit.digitallibrary.catalog.model.Section;

public record ChapterSummary(int chapterNo, String title, List<String> sectionHeadings) {

    public static ChapterSummary from(Chapter chapter) {
        List<Section> sections = chapter.sections() == null ? List.of() : chapter.sections();
        return new ChapterSummary(chapter.chapterNo(), chapter.title(),
                sections.stream().map(Section::heading).toList());
    }
}
