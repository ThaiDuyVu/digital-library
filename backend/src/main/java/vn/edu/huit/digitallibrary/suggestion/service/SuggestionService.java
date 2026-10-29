package vn.edu.huit.digitallibrary.suggestion.service;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import java.time.Instant;
import org.bson.types.ObjectId;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;
import vn.edu.huit.digitallibrary.common.ApiException;
import vn.edu.huit.digitallibrary.common.PageResponse;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.suggestion.dto.MySuggestionResponse;
import vn.edu.huit.digitallibrary.suggestion.model.BookSuggestion;

@Service
public class SuggestionService {

    private final MongoTemplate mongo;

    public SuggestionService(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    public MySuggestionResponse mine(CurrentUser user) {
        return new MySuggestionResponse(1, mongo.findById(user.id(), BookSuggestion.class));
    }

    public BookSuggestion submit(CurrentUser user, String description) {
        String text = requireText(description, 1000);
        try {
            // insert, không dùng save/upsert: không bao giờ ghi đè đề xuất và phản hồi cũ.
            return mongo.insert(new BookSuggestion(user.id(), user.username(), text, Instant.now(), null, null, null));
        } catch (DuplicateKeyException ex) {
            throw ApiException.conflict("Bạn đã dùng lượt đề xuất của mình. Hãy theo dõi phản hồi tại đây nhé!");
        }
    }

    public PageResponse<BookSuggestion> list(int page, int size, String status) {
        if (page < 0 || size < 1 || size > 100) {
            throw ApiException.badRequest("page phải >= 0 và size trong khoảng 1..100");
        }
        long total = mongo.count(filter(status), BookSuggestion.class);
        Query query = filter(status).with(Sort.by(Sort.Direction.DESC, "createdAt", "_id"))
                .skip((long) page * size).limit(size);
        return PageResponse.of(mongo.find(query, BookSuggestion.class), page, size, total);
    }

    public BookSuggestion reply(String id, CurrentUser admin, String reply) {
        String text = requireText(reply, 2000);
        if (!ObjectId.isValid(id)) {
            throw ApiException.notFound("Không tìm thấy đề xuất");
        }
        Update update = new Update().set("reply", text).set("repliedAt", Instant.now())
                .set("repliedBy", admin.username());
        BookSuggestion saved = mongo.findAndModify(query(where("_id").is(id)), update,
                FindAndModifyOptions.options().returnNew(true), BookSuggestion.class);
        if (saved == null) {
            throw ApiException.notFound("Không tìm thấy đề xuất");
        }
        return saved;
    }

    private static Query filter(String status) {
        return switch (status) {
            case "all" -> new Query();
            case "pending" -> query(where("reply").is(null));
            case "replied" -> query(where("reply").ne(null));
            default -> throw ApiException.badRequest("status phải là all, pending hoặc replied");
        };
    }

    private static String requireText(String value, int maxLength) {
        if (value == null || value.isBlank() || value.length() > maxLength) {
            throw ApiException.badRequest("Nội dung không được để trống và tối đa " + maxLength + " ký tự");
        }
        return value.strip();
    }
}
