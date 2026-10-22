package vn.edu.huit.digitallibrary.catalog.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/** chapterNo bỏ trống khi thêm chương thì hệ thống gán số kế tiếp; sectionNo bỏ trống thì đánh theo thứ tự. */
public record ChapterRequest(
        @Min(1) Integer chapterNo,
        @NotBlank @Size(max = 300) String title,
        String content,
        List<@Valid SectionRequest> sections) {
}
