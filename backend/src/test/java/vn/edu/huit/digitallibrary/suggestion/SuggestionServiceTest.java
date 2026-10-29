package vn.edu.huit.digitallibrary.suggestion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import vn.edu.huit.digitallibrary.common.ApiException;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.suggestion.model.BookSuggestion;
import vn.edu.huit.digitallibrary.suggestion.service.SuggestionService;

class SuggestionServiceTest {
    private static final String ID = "6ae1727f39253d94030cffa3";
    private static final CurrentUser READER = new CurrentUser(ID, "reader", Role.USER);
    private static final CurrentUser ADMIN = new CurrentUser("6ae1727f39253d94030cffa4", "admin", Role.ADMIN);
    private MongoTemplate mongo;
    private SuggestionService service;

    @BeforeEach
    void setUp() {
        mongo = mock(MongoTemplate.class);
        service = new SuggestionService(mongo);
    }

    @Test
    void submitUsesAccountIdAsUniqueIdAndTrimsDescription() {
        given(mongo.insert(any(BookSuggestion.class))).willAnswer(call -> call.getArgument(0));
        BookSuggestion saved = service.submit(READER, "  Hoàng tử bé — Antoine de Saint-Exupéry  ");
        assertThat(saved.id()).isEqualTo(ID);
        assertThat(saved.username()).isEqualTo("reader");
        assertThat(saved.description()).isEqualTo("Hoàng tử bé — Antoine de Saint-Exupéry");
        assertThat(saved.reply()).isNull();
        assertThat(saved.createdAt()).isNotNull();
    }

    @Test
    void duplicateInsertBecomesConflictWithoutOverwritingOriginal() {
        given(mongo.insert(any(BookSuggestion.class))).willThrow(new DuplicateKeyException("_id exists"));
        assertThatThrownBy(() -> service.submit(READER, "Sách khác"))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getStatus().value()).isEqualTo(409));
    }

    @Test
    void mineReadsOnlyAuthenticatedAccountAndReportsOneLifetimeSlot() {
        BookSuggestion stored = new BookSuggestion(ID, "reader", "Sách", Instant.EPOCH, null, null, null);
        given(mongo.findById(ID, BookSuggestion.class)).willReturn(stored);
        assertThat(service.mine(READER).limit()).isEqualTo(1);
        assertThat(service.mine(READER).suggestion()).isEqualTo(stored);
    }

    @Test
    void replyUpdatesOnlyReplyFieldsAndReturnsSavedRecord() {
        BookSuggestion stored = new BookSuggestion(ID, "reader", "Sách gốc", Instant.EPOCH,
                "Cảm ơn bạn", Instant.now(), "admin");
        given(mongo.findAndModify(any(Query.class), any(Update.class), any(FindAndModifyOptions.class),
                eq(BookSuggestion.class))).willReturn(stored);
        assertThat(service.reply(ID, ADMIN, "  Cảm ơn bạn  ")).isEqualTo(stored);
        ArgumentCaptor<Query> query = ArgumentCaptor.forClass(Query.class);
        ArgumentCaptor<Update> update = ArgumentCaptor.forClass(Update.class);
        verify(mongo).findAndModify(query.capture(), update.capture(), any(FindAndModifyOptions.class), eq(BookSuggestion.class));
        assertThat(query.getValue().getQueryObject().getString("_id")).isEqualTo(ID);
        var fields = update.getValue().getUpdateObject().get("$set", org.bson.Document.class);
        assertThat(fields.keySet()).containsExactlyInAnyOrder("reply", "repliedAt", "repliedBy");
        assertThat(fields.getString("reply")).isEqualTo("Cảm ơn bạn");
        assertThat(fields.getString("repliedBy")).isEqualTo("admin");
    }

    @Test
    void replyToUnknownSuggestionReturns404() {
        assertThatThrownBy(() -> service.reply(ID, ADMIN, "Phản hồi"))
                .isInstanceOfSatisfying(ApiException.class, ex -> assertThat(ex.getStatus().value()).isEqualTo(404));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "\n\t"})
    void blankContentNeverTouchesMongo(String text) {
        assertThatThrownBy(() -> service.submit(READER, text)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.reply(ID, ADMIN, text)).isInstanceOf(ApiException.class);
        verifyNoInteractions(mongo);
    }

    @Test
    void rejectsOversizedContentAndInvalidListParameters() {
        assertThatThrownBy(() -> service.submit(READER, "x".repeat(1001))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.reply(ID, ADMIN, "x".repeat(2001))).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.list(-1, 10, "all")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.list(0, 0, "all")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.list(0, 101, "all")).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.list(0, 10, "invalid")).isInstanceOf(ApiException.class);
        verifyNoInteractions(mongo);
    }
}
