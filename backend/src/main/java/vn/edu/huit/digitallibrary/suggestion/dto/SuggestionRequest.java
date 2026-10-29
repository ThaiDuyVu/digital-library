package vn.edu.huit.digitallibrary.suggestion.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SuggestionRequest(
        @NotBlank(message = "Hãy nhập tên và tác giả quyển sách bạn muốn bổ sung")
        @Size(max = 1000, message = "Đề xuất tối đa 1000 ký tự") String description) {
}
