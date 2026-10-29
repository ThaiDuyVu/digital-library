package vn.edu.huit.digitallibrary.suggestion.controller;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import vn.edu.huit.digitallibrary.common.PageResponse;
import vn.edu.huit.digitallibrary.identity.auth.AdminOnly;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.suggestion.dto.ReplyRequest;
import vn.edu.huit.digitallibrary.suggestion.model.BookSuggestion;
import vn.edu.huit.digitallibrary.suggestion.service.SuggestionService;

@RestController
@AdminOnly
@RequestMapping("/api/admin/suggestions")
public class AdminSuggestionController {

    private final SuggestionService suggestions;

    public AdminSuggestionController(SuggestionService suggestions) {
        this.suggestions = suggestions;
    }

    @GetMapping
    public PageResponse<BookSuggestion> list(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(defaultValue = "all") String status) {
        return suggestions.list(page, size, status);
    }

    @PutMapping("/{id}/reply")
    public BookSuggestion reply(@PathVariable String id, @Valid @RequestBody ReplyRequest request,
            CurrentUser admin) {
        return suggestions.reply(id, admin, request.reply());
    }
}
