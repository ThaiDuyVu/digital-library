package vn.edu.huit.digitallibrary.suggestion.dto;

import vn.edu.huit.digitallibrary.suggestion.model.BookSuggestion;

public record MySuggestionResponse(int limit, BookSuggestion suggestion) {
}
