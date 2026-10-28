package vn.edu.huit.digitallibrary.reading;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import java.util.Optional;
import java.util.List;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import vn.edu.huit.digitallibrary.catalog.event.BookDeletedEvent;
import vn.edu.huit.digitallibrary.catalog.service.BookService;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.identity.event.UserDeletedEvent;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.identity.service.UserService;
import vn.edu.huit.digitallibrary.reading.controller.ProgressController;
import vn.edu.huit.digitallibrary.reading.dto.ProgressEntry;
import vn.edu.huit.digitallibrary.reading.repository.ProgressRepository;
import vn.edu.huit.digitallibrary.reading.service.ProgressService;

@WebMvcTest(ProgressController.class)
@Import(ProgressService.class)
class ProgressApiTest {
    @Autowired MockMvc mvc;
    @Autowired ApplicationEventPublisher events;
    @MockitoBean ProgressRepository progress;
    @MockitoBean BookService books;
    @MockitoBean UserService users;

    @ParameterizedTest
    @ValueSource(strings = {
            "{}", "{\"chapter\":null,\"page\":1,\"line\":0}",
            "{\"chapter\":0,\"page\":1,\"line\":0}",
            "{\"chapter\":1,\"page\":0,\"line\":0}",
            "{\"chapter\":1,\"page\":1,\"line\":-1}",
            "{\"chapter\":\"wrong\",\"page\":1,\"line\":0}", "{",
            "{\"chapter\":1.5,\"page\":1,\"line\":0}",
            "{\"chapter\":1,\"page\":\"30\",\"line\":0}",
            "{\"chapter\":1,\"page\":1,\"line\":false}",
            "{\"chapter\":2147483648,\"page\":1,\"line\":0}"
    })
    void invalidBodiesNeverReachRedis(String body) throws Exception {
        login();
        mvc.perform(put("/api/progress/u1/b1").header("Authorization", "Bearer valid")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"));
        verifyNoInteractions(progress, books);
    }

    @Test
    void missingAndInvalidTokensCannotReadOrWrite() throws Exception {
        mvc.perform(get("/api/progress/u1/b1")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/progress/u1/b1").header("Authorization", "Bearer invalid")
                .contentType(MediaType.APPLICATION_JSON).content("{\"chapter\":1,\"page\":1,\"line\":0}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(progress, books);
    }

    @Test
    void readerCannotAccessAnotherUsersProgress() throws Exception {
        login();
        mvc.perform(get("/api/progress/u2/b1").header("Authorization", "Bearer valid"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/progress/u2/b1").header("Authorization", "Bearer valid")
                .contentType(MediaType.APPLICATION_JSON).content("{\"chapter\":1,\"page\":1,\"line\":0}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(progress, books);
    }

    private void login() {
        given(users.authenticate("valid")).willReturn(Optional.of(new CurrentUser("u1", "reader", Role.USER)));
    }

    @Test
    void progressListRequiresOwnerOrAdmin() throws Exception {
        mvc.perform(get("/api/progress/u1")).andExpect(status().isUnauthorized());
        login();
        mvc.perform(get("/api/progress/u2").header("Authorization", "Bearer valid"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(progress, books);
    }

    @Test
    void progressListSkipsMissingBooksAndSortsNewestFirst() throws Exception {
        login();
        Instant old = Instant.parse("2026-10-26T00:00:00Z");
        given(progress.findByUser("u1")).willReturn(List.of(
                new ProgressEntry("old", 1, 2, 0, old),
                new ProgressEntry("deleted", 1, 3, 0, old.plusSeconds(3)),
                new ProgressEntry("new", 3, 30, 2, old.plusSeconds(1))));
        given(books.exists("old")).willReturn(true);
        given(books.exists("new")).willReturn(true);
        mvc.perform(get("/api/progress/u1").header("Authorization", "Bearer valid"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].bookId").value("new"))
                .andExpect(jsonPath("$[0].chapter").value(3)).andExpect(jsonPath("$[0].page").value(30))
                .andExpect(jsonPath("$[0].line").value(2))
                .andExpect(jsonPath("$[1].bookId").value("old"));
    }

    @Test
    void emptyProgressListAndAdminCanonicalTarget() throws Exception {
        String target = "5eed00000000000000000001";
        given(users.authenticate("admin")).willReturn(Optional.of(new CurrentUser("admin", "admin", Role.ADMIN)));
        given(progress.findByUser(target)).willReturn(List.of());
        mvc.perform(get("/api/progress/" + target.toUpperCase(java.util.Locale.ROOT))
                        .header("Authorization", "Bearer admin"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        verify(users).get(target);
        verify(progress).findByUser(target);
    }

    @Test
    void deletingBookOrUserRemovesTheirProgress() {
        events.publishEvent(new BookDeletedEvent("b00c00000000000000000001"));
        events.publishEvent(new UserDeletedEvent("5eed00000000000000000001"));
        verify(progress).deleteByBook("b00c00000000000000000001");
        verify(progress).deleteByUser("5eed00000000000000000001");
    }
}
