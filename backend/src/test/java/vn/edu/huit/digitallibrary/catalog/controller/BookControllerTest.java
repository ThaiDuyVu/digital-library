package vn.edu.huit.digitallibrary.catalog.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import vn.edu.huit.digitallibrary.catalog.dto.BookDetail;
import vn.edu.huit.digitallibrary.catalog.service.BookService;
import vn.edu.huit.digitallibrary.common.ApiException;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.identity.service.UserService;

@WebMvcTest(BookController.class)
class BookControllerTest {

    private static final String BOOK_JSON = """
            {"title":"Dế Mèn phiêu lưu ký","author":"Tô Hoài","categories":["Thiếu nhi"]}
            """;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private BookService bookService;

    @MockitoBean
    private UserService userService;

    @Test
    void createWithoutTokenReturns401() throws Exception {
        mockMvc.perform(post("/api/books").contentType(MediaType.APPLICATION_JSON).content(BOOK_JSON))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        verifyNoInteractions(bookService);
    }

    @Test
    void createAsReaderReturns403() throws Exception {
        given(userService.authenticate("reader-token"))
                .willReturn(Optional.of(new CurrentUser("u1", "reader", Role.USER)));

        mockMvc.perform(post("/api/books").header("Authorization", "Bearer reader-token")
                        .contentType(MediaType.APPLICATION_JSON).content(BOOK_JSON))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        verifyNoInteractions(bookService);
    }

    @Test
    void createAsAdminReturns201() throws Exception {
        given(userService.authenticate("admin-token"))
                .willReturn(Optional.of(new CurrentUser("a1", "admin", Role.ADMIN)));
        given(bookService.create(any())).willReturn(new BookDetail("b1", "Dế Mèn phiêu lưu ký", "Tô Hoài",
                List.of("Thiếu nhi"), null, null, List.of(), Instant.EPOCH, Instant.EPOCH));

        mockMvc.perform(post("/api/books").header("Authorization", "Bearer admin-token")
                        .contentType(MediaType.APPLICATION_JSON).content(BOOK_JSON))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value("b1"));
    }

    @Test
    void createWithBlankTitleReturns400() throws Exception {
        given(userService.authenticate("admin-token"))
                .willReturn(Optional.of(new CurrentUser("a1", "admin", Role.ADMIN)));

        mockMvc.perform(post("/api/books").header("Authorization", "Bearer admin-token")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"\",\"author\":\"Tô Hoài\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }

    @Test
    void missingBookReturns404WithErrorBody() throws Exception {
        given(bookService.get("missing")).willThrow(ApiException.notFound("Không tìm thấy sách missing"));

        mockMvc.perform(get("/api/books/missing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Không tìm thấy sách missing"));
    }
}
