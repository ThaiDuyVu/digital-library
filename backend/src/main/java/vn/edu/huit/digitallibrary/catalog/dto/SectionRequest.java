package vn.edu.huit.digitallibrary.catalog.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SectionRequest(
        @Min(1) Integer sectionNo,
        @NotNull @Size(max = 300) String heading,
        @NotNull String text) {
}
