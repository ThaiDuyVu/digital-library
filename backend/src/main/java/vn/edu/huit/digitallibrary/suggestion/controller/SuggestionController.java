package vn.edu.huit.digitallibrary.suggestion.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.edu.huit.digitallibrary.identity.auth.Authenticated;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.suggestion.dto.MySuggestionResponse;
import vn.edu.huit.digitallibrary.suggestion.dto.SuggestionRequest;
import vn.edu.huit.digitallibrary.suggestion.model.BookSuggestion;
import vn.edu.huit.digitallibrary.suggestion.service.SuggestionService;

@RestController
@Authenticated
@RequestMapping("/api/suggestions")
public class SuggestionController {

    private final SuggestionService suggestions;

    public SuggestionController(SuggestionService suggestions) {
        this.suggestions = suggestions;
    }

    @GetMapping("/mine")
    public MySuggestionResponse mine(CurrentUser user) {
        return suggestions.mine(user);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookSuggestion submit(@Valid @RequestBody SuggestionRequest request, CurrentUser user) {
        return suggestions.submit(user, request.description());
    }
}
