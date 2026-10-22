package vn.edu.huit.digitallibrary.catalog.model;

import java.util.List;

/** Chương được embed trong document sách; chapterNo bắt đầu từ 1 và duy nhất trong một sách. */
public record Chapter(Integer chapterNo, String title, String content, List<Section> sections) {
}
