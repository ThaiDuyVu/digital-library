package vn.edu.huit.digitallibrary.suggestion.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ReplyRequest(
        @NotBlank(message = "Hãy nhập nội dung phản hồi")
        @Size(max = 2000, message = "Phản hồi tối đa 2000 ký tự") String reply) {
}
