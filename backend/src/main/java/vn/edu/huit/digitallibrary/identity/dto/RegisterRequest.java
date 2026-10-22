package vn.edu.huit.digitallibrary.identity.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9_.]{3,32}$",
                message = "chỉ gồm chữ, số, dấu _ hoặc . và dài 3–32 ký tự") String username,
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 6, max = 72) String password,
        @Size(max = 100) String fullName) {
}
