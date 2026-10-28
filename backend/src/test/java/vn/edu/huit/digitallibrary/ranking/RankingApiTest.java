package vn.edu.huit.digitallibrary.ranking;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import vn.edu.huit.digitallibrary.catalog.event.BookDeletedEvent;
import vn.edu.huit.digitallibrary.catalog.service.BookService;
import vn.edu.huit.digitallibrary.identity.service.UserService;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.ranking.controller.RankingController;
import vn.edu.huit.digitallibrary.ranking.dto.RankingEntry;
import vn.edu.huit.digitallibrary.ranking.repository.RankingRepository;
import vn.edu.huit.digitallibrary.ranking.service.RankingService;

@WebMvcTest(RankingController.class)
@Import(RankingService.class)
class RankingApiTest {
    @Autowired MockMvc mvc;
    @Autowired ApplicationEventPublisher events;
    @MockitoBean RankingRepository ranking;
    @MockitoBean BookService books;
    @MockitoBean UserService users;

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "101", "2147483648", "1.5", "abc"})
    void invalidTopNeverReadsRedis(String top) throws Exception {
        mvc.perform(get("/api/ranking").param("top", top))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"));
        verifyNoInteractions(ranking, books, users);
    }

    @Test
    void defaultTopIsTenAndPublic() throws Exception {
        given(ranking.top(10)).willReturn(List.of(new RankingEntry("book", 42)));
        mvc.perform(get("/api/ranking")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].bookId").value("book"))
                .andExpect(jsonPath("$[0].score").value(42));
        verify(ranking).top(10);
        verifyNoInteractions(users);
    }

    @Test
    void missingBookDoesNotIncrement() throws Exception {
        login();
        mvc.perform(post("/api/books/missing/read").param("chapterNo", "1")
                        .header("Authorization", "Bearer valid")).andExpect(status().isNotFound());
        verifyNoInteractions(ranking);
    }

    @Test
    void authenticatedReadUsesCurrentUserAndChapter() throws Exception {
        login();
        given(books.exists("book")).willReturn(true);
        given(ranking.increment("book", "u1", 3)).willReturn(new RankingEntry("book", 2));
        mvc.perform(post("/api/books/book/read").param("chapterNo", "3")
                        .header("Authorization", "Bearer valid")).andExpect(status().isOk())
                .andExpect(jsonPath("$.score").value(2));
        verify(books).getChapter("book", 3);
        verify(ranking).increment("book", "u1", 3);
    }

    @Test
    void readRequiresLoginAndChapter() throws Exception {
        mvc.perform(post("/api/books/book/read").param("chapterNo", "1")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/books/book/read").param("chapterNo", "1")
                .header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
        login();
        mvc.perform(post("/api/books/book/read").header("Authorization", "Bearer valid"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(ranking, books);
    }

    @ParameterizedTest
    @ValueSource(strings = {"0", "-1", "abc", "1.5", "2147483648"})
    void invalidChapterDoesNotReachRedis(String chapter) throws Exception {
        login();
        mvc.perform(post("/api/books/book/read").param("chapterNo", chapter)
                        .header("Authorization", "Bearer valid"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(ranking, books);
    }

    private void login() {
        given(users.authenticate("valid")).willReturn(Optional.of(new CurrentUser("u1", "reader", Role.USER)));
    }

    @Test
    void deletedBookIsRemovedFromRanking() {
        events.publishEvent(new BookDeletedEvent("b00c00000000000000000001"));
        verify(ranking).remove("b00c00000000000000000001");
    }
}
