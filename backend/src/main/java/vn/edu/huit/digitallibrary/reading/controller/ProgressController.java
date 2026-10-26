package vn.edu.huit.digitallibrary.reading.controller;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import vn.edu.huit.digitallibrary.identity.auth.Authenticated;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.reading.dto.ProgressRequest;
import vn.edu.huit.digitallibrary.reading.dto.ProgressEntry;
import vn.edu.huit.digitallibrary.reading.dto.ProgressResponse;
import vn.edu.huit.digitallibrary.reading.service.ProgressService;

@RestController
@RequestMapping("/api/progress/{userId}")
public class ProgressController {
    private final ProgressService progress;

    public ProgressController(ProgressService progress) {
        this.progress = progress;
    }

    @Authenticated
    @PutMapping("/{bookId}")
    public ProgressResponse save(@PathVariable String userId, @PathVariable String bookId,
            @Valid @RequestBody ProgressRequest request, CurrentUser currentUser) {
        return progress.save(userId, bookId, request, currentUser);
    }

    @Authenticated
    @GetMapping("/{bookId}")
    public ProgressResponse get(@PathVariable String userId, @PathVariable String bookId, CurrentUser currentUser) {
        return progress.get(userId, bookId, currentUser);
    }

    @Authenticated
    @GetMapping
    public List<ProgressEntry> list(@PathVariable String userId, CurrentUser currentUser) {
        return progress.list(userId, currentUser);
    }
}
