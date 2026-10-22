package vn.edu.huit.digitallibrary.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Thông tin mô tả sách dùng cho PUT; chương được sửa qua các endpoint /chapters. */
public record BookRequest(
        @NotBlank @Size(max = 300) String title,
        @NotBlank @Size(max = 200) String author,
        @Size(max = 20) List<@NotBlank @Size(max = 100) String> categories,
        @Size(max = 5000) String description,
        @Size(max = 2000) String coverUrl) {
}
