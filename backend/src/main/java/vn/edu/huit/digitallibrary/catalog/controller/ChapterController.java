package vn.edu.huit.digitallibrary.catalog.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.edu.huit.digitallibrary.catalog.dto.ChapterContent;
import vn.edu.huit.digitallibrary.catalog.dto.ChapterRequest;
import vn.edu.huit.digitallibrary.catalog.dto.ChapterSummary;
import vn.edu.huit.digitallibrary.catalog.service.BookService;
import vn.edu.huit.digitallibrary.identity.auth.AdminOnly;

@RestController
@RequestMapping("/api/books/{bookId}/chapters")
public class ChapterController {

    private final BookService bookService;

    public ChapterController(BookService bookService) {
        this.bookService = bookService;
    }

    @GetMapping("/{chapterNo}")
    public ChapterContent get(@PathVariable String bookId, @PathVariable int chapterNo) {
        return bookService.getChapter(bookId, chapterNo);
    }

    @AdminOnly
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ChapterSummary add(@PathVariable String bookId, @Valid @RequestBody ChapterRequest request) {
        return bookService.addChapter(bookId, request);
    }

    @AdminOnly
    @PutMapping("/{chapterNo}")
    public ChapterSummary update(@PathVariable String bookId, @PathVariable int chapterNo,
            @Valid @RequestBody ChapterRequest request) {
        return bookService.updateChapter(bookId, chapterNo, request);
    }

    @AdminOnly
    @DeleteMapping("/{chapterNo}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String bookId, @PathVariable int chapterNo) {
        bookService.deleteChapter(bookId, chapterNo);
    }
}
