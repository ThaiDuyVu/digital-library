package vn.edu.huit.digitallibrary.suggestion;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import vn.edu.huit.digitallibrary.common.ApiException;
import vn.edu.huit.digitallibrary.common.PageResponse;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.identity.service.UserService;
import vn.edu.huit.digitallibrary.suggestion.controller.AdminSuggestionController;
import vn.edu.huit.digitallibrary.suggestion.controller.SuggestionController;
import vn.edu.huit.digitallibrary.suggestion.dto.MySuggestionResponse;
import vn.edu.huit.digitallibrary.suggestion.model.BookSuggestion;
import vn.edu.huit.digitallibrary.suggestion.service.SuggestionService;

@WebMvcTest({SuggestionController.class, AdminSuggestionController.class})
class SuggestionControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean SuggestionService suggestions;
    @MockitoBean UserService users;
    private final CurrentUser reader = new CurrentUser("reader-id", "reader", Role.USER);
    private final CurrentUser admin = new CurrentUser("admin-id", "admin", Role.ADMIN);

    @Test
    void allEndpointsRequireAuthentication() throws Exception {
        mvc.perform(get("/api/suggestions/mine")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/suggestions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"Sách\"}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/suggestions")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/admin/suggestions/other/reply").contentType(MediaType.APPLICATION_JSON)
                .content("{\"reply\":\"Phản hồi\"}")).andExpect(status().isUnauthorized());
        verifyNoInteractions(suggestions);
    }

    @Test
    void readerCannotListOthersOrReply() throws Exception {
        login(reader);
        mvc.perform(get("/api/admin/suggestions").header("Authorization", "Bearer valid"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/suggestions/other/reply").header("Authorization", "Bearer valid")
                .contentType(MediaType.APPLICATION_JSON).content("{\"reply\":\"Giả admin\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(suggestions);
    }

    @Test
    void submitAndMineUseCurrentUserIgnoringClientAccountId() throws Exception {
        login(reader);
        BookSuggestion stored = new BookSuggestion(reader.id(), "reader", "Sách — Tác giả", Instant.EPOCH, null, null, null);
        given(suggestions.submit(eq(reader), any())).willReturn(stored);
        given(suggestions.mine(reader)).willReturn(new MySuggestionResponse(1, stored));
        mvc.perform(post("/api/suggestions").header("Authorization", "Bearer valid")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"description\":\"Sách — Tác giả\",\"userId\":\"victim\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(reader.id()));
        mvc.perform(get("/api/suggestions/mine").param("userId", "victim").header("Authorization", "Bearer valid"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.limit").value(1))
                .andExpect(jsonPath("$.suggestion.id").value(reader.id()));
        verify(suggestions).submit(reader, "Sách — Tác giả");
        verify(suggestions).mine(reader);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"description\":\"\"}", "{\"description\":\"   \"}"})
    void invalidDescriptionReturns400(String body) throws Exception {
        login(reader);
        mvc.perform(post("/api/suggestions").header("Authorization", "Bearer valid")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        verifyNoInteractions(suggestions);
    }

    @Test
    void duplicateSubmissionReturns409() throws Exception {
        login(reader);
        given(suggestions.submit(eq(reader), any())).willThrow(ApiException.conflict("Hết lượt"));
        mvc.perform(post("/api/suggestions").header("Authorization", "Bearer valid")
                .contentType(MediaType.APPLICATION_JSON).content("{\"description\":\"Sách\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    void adminCanFilterAndReply() throws Exception {
        login(admin);
        given(suggestions.list(0, 10, "pending")).willReturn(PageResponse.of(List.of(), 0, 10, 0));
        BookSuggestion stored = new BookSuggestion(reader.id(), "reader", "Sách", Instant.EPOCH,
                "Đã tiếp nhận", Instant.EPOCH, "admin");
        given(suggestions.reply(reader.id(), admin, "Đã tiếp nhận")).willReturn(stored);
        mvc.perform(get("/api/admin/suggestions").param("status", "pending").header("Authorization", "Bearer valid"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(put("/api/admin/suggestions/reader-id/reply").header("Authorization", "Bearer valid")
                .contentType(MediaType.APPLICATION_JSON).content("{\"reply\":\"Đã tiếp nhận\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reply").value("Đã tiếp nhận"));
        verify(suggestions).list(0, 10, "pending");
        verify(suggestions).reply(reader.id(), admin, "Đã tiếp nhận");
    }

    @Test
    void blankReplyIsRejectedBeforeService() throws Exception {
        login(admin);
        mvc.perform(put("/api/admin/suggestions/reader-id/reply").header("Authorization", "Bearer valid")
                .contentType(MediaType.APPLICATION_JSON).content("{\"reply\":\" \"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(suggestions);
    }

    private void login(CurrentUser user) {
        given(users.authenticate("valid")).willReturn(Optional.of(user));
    }
}
