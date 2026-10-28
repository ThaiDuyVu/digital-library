package vn.edu.huit.digitallibrary.catalog.controller;

import jakarta.validation.Valid;
import java.util.Arrays;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.edu.huit.digitallibrary.catalog.dto.BookContent;
import vn.edu.huit.digitallibrary.catalog.dto.BookDetail;
import vn.edu.huit.digitallibrary.catalog.dto.BookRequest;
import vn.edu.huit.digitallibrary.catalog.dto.BookSummary;
import vn.edu.huit.digitallibrary.catalog.dto.CreateBookRequest;
import vn.edu.huit.digitallibrary.catalog.service.BookService;
import vn.edu.huit.digitallibrary.common.PageResponse;
import vn.edu.huit.digitallibrary.identity.auth.AdminOnly;

@RestController
@RequestMapping("/api/books")
public class BookController {

    private final BookService bookService;

    public BookController(BookService bookService) {
        this.bookService = bookService;
    }

    @GetMapping
    public PageResponse<BookSummary> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String q) {
        return bookService.list(page, size, category, q);
    }

    /** Ghép thông tin sách cho bảng xếp hạng: {@code GET /api/books/batch?ids=a,b,c}, giữ nguyên thứ tự. */
    @GetMapping("/batch")
    public List<BookSummary> batch(@RequestParam String ids) {
        return bookService.findSummaries(Arrays.stream(ids.split(",")).map(String::trim).toList());
    }

    @GetMapping("/categories")
    public List<String> categories() {
        return bookService.categories();
    }

    @GetMapping("/{bookId}")
    public BookDetail get(@PathVariable String bookId) {
        return bookService.get(bookId);
    }

    /** Toàn văn cả cuốn cho E-Reader; {@code GET /{bookId}} vẫn trả mục lục không kèm nội dung. */
    @GetMapping("/{bookId}/content")
    public BookContent content(@PathVariable String bookId) {
        return bookService.content(bookId);
    }

    @AdminOnly
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookDetail create(@Valid @RequestBody CreateBookRequest request) {
        return bookService.create(request);
    }

    @AdminOnly
    @PutMapping("/{bookId}")
    public BookDetail update(@PathVariable String bookId, @Valid @RequestBody BookRequest request) {
        return bookService.update(bookId, request);
    }

    @AdminOnly
    @DeleteMapping("/{bookId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String bookId) {
        bookService.delete(bookId);
    }
}
