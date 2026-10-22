package vn.edu.huit.digitallibrary.catalog.service;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

import com.mongodb.client.result.UpdateResult;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.TextCriteria;
import org.springframework.data.mongodb.core.query.TextQuery;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import vn.edu.huit.digitallibrary.catalog.dto.BookDetail;
import vn.edu.huit.digitallibrary.catalog.dto.BookRequest;
import vn.edu.huit.digitallibrary.catalog.dto.BookSummary;
import vn.edu.huit.digitallibrary.catalog.dto.ChapterContent;
import vn.edu.huit.digitallibrary.catalog.dto.ChapterRequest;
import vn.edu.huit.digitallibrary.catalog.dto.ChapterSummary;
import vn.edu.huit.digitallibrary.catalog.dto.CreateBookRequest;
import vn.edu.huit.digitallibrary.catalog.dto.SectionRequest;
import vn.edu.huit.digitallibrary.catalog.model.Book;
import vn.edu.huit.digitallibrary.catalog.model.Chapter;
import vn.edu.huit.digitallibrary.catalog.model.Section;
import vn.edu.huit.digitallibrary.common.ApiException;
import vn.edu.huit.digitallibrary.common.PageResponse;

/**
 * Service công khai của domain catalog. Domain khác (ranking, reading) gọi {@link #exists(String)} và
 * {@link #findSummaries(List)} thay vì truy cập collection books.
 */
@Service
public class BookService {

    public static final int MAX_PAGE_SIZE = 100;
    public static final int MAX_BATCH_SIZE = 100;

    private final MongoTemplate mongoTemplate;

    public BookService(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    public PageResponse<BookSummary> list(int page, int size, String category, String keyword) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw ApiException.badRequest("page phải >= 0 và size trong khoảng 1.." + MAX_PAGE_SIZE);
        }
        long total = mongoTemplate.count(filter(category, keyword), Book.class);
        Query pageQuery = filter(category, keyword).skip((long) page * size).limit(size);
        if (!StringUtils.hasText(keyword)) {
            pageQuery.with(Sort.by(Sort.Direction.DESC, "createdAt", "_id"));
        }
        excludeChapterBodies(pageQuery);
        List<BookSummary> content = mongoTemplate.find(pageQuery, Book.class).stream()
                .map(BookSummary::from)
                .toList();
        return PageResponse.of(content, page, size, total);
    }

    /** Lấy thông tin tóm tắt theo đúng thứ tự ids, bỏ qua id không tồn tại. Dùng cho bảng xếp hạng. */
    public List<BookSummary> findSummaries(List<String> ids) {
        List<String> distinctIds = ids.stream().filter(ObjectId::isValid).distinct().toList();
        if (distinctIds.size() > MAX_BATCH_SIZE) {
            throw ApiException.badRequest("Tối đa " + MAX_BATCH_SIZE + " bookId mỗi lần");
        }
        if (distinctIds.isEmpty()) {
            return List.of();
        }
        Query batchQuery = query(where("_id").in(distinctIds.stream().map(ObjectId::new).toList()));
        excludeChapterBodies(batchQuery);
        Map<String, BookSummary> byId = mongoTemplate.find(batchQuery, Book.class).stream()
                .map(BookSummary::from)
                .collect(Collectors.toMap(BookSummary::id, Function.identity()));
        return distinctIds.stream().filter(byId::containsKey).map(byId::get).toList();
    }

    public List<String> categories() {
        return mongoTemplate.findDistinct(new Query(), "categories", Book.class, String.class).stream()
                .sorted()
                .toList();
    }

    public boolean exists(String bookId) {
        return ObjectId.isValid(bookId) && mongoTemplate.exists(byId(bookId), Book.class);
    }

    public BookDetail get(String bookId) {
        Query detailQuery = byId(requireObjectId(bookId));
        excludeChapterContent(detailQuery);
        Book book = mongoTemplate.findOne(detailQuery, Book.class);
        if (book == null) {
            throw bookNotFound(bookId);
        }
        return BookDetail.from(book);
    }

    public BookDetail create(CreateBookRequest request) {
        Book book = new Book();
        applyMetadata(book, request.metadata());
        book.setChapters(toChapters(request.chapters()));
        Instant now = Instant.now();
        book.setCreatedAt(now);
        book.setUpdatedAt(now);
        return BookDetail.from(mongoTemplate.insert(book));
    }

    public BookDetail update(String bookId, BookRequest request) {
        Book values = new Book();
        applyMetadata(values, request);
        Update update = new Update()
                .set("title", values.getTitle())
                .set("author", values.getAuthor())
                .set("categories", values.getCategories())
                .set("updatedAt", Instant.now());
        setOrUnset(update, "description", values.getDescription());
        setOrUnset(update, "coverUrl", values.getCoverUrl());

        Query updateQuery = byId(requireObjectId(bookId));
        excludeChapterContent(updateQuery);
        Book updated = mongoTemplate.findAndModify(updateQuery, update,
                FindAndModifyOptions.options().returnNew(true), Book.class);
        if (updated == null) {
            throw bookNotFound(bookId);
        }
        return BookDetail.from(updated);
    }

    public void delete(String bookId) {
        if (mongoTemplate.remove(byId(requireObjectId(bookId)), Book.class).getDeletedCount() == 0) {
            throw bookNotFound(bookId);
        }
    }

    public ChapterContent getChapter(String bookId, int chapterNo) {
        Query chapterQuery = byId(requireObjectId(bookId));
        chapterQuery.fields().include("title").elemMatch("chapters", where("chapterNo").is(chapterNo));
        Book book = mongoTemplate.findOne(chapterQuery, Book.class);
        if (book == null) {
            throw bookNotFound(bookId);
        }
        if (book.getChapters().isEmpty()) {
            throw chapterNotFound(bookId, chapterNo);
        }
        return ChapterContent.from(book.getId(), book.getTitle(), book.getChapters().get(0));
    }

    /** Thêm chương bằng $push kèm $sort để mảng chapters luôn theo thứ tự chapterNo. */
    public ChapterSummary addChapter(String bookId, ChapterRequest request) {
        requireObjectId(bookId);
        int chapterNo = request.chapterNo() != null ? request.chapterNo() : nextChapterNo(bookId);
        Chapter chapter = toChapter(request, chapterNo);

        Query target = query(where("_id").is(new ObjectId(bookId)).and("chapters.chapterNo").ne(chapterNo));
        Update update = new Update().set("updatedAt", Instant.now());
        update.push("chapters").sort(Sort.by("chapterNo")).each(chapter);
        if (mongoTemplate.updateFirst(target, update, Book.class).getMatchedCount() == 0) {
            if (!exists(bookId)) {
                throw bookNotFound(bookId);
            }
            throw ApiException.conflict("Chương " + chapterNo + " đã tồn tại trong sách " + bookId);
        }
        return ChapterSummary.from(chapter);
    }

    public ChapterSummary updateChapter(String bookId, int chapterNo, ChapterRequest request) {
        requireObjectId(bookId);
        if (request.chapterNo() != null && request.chapterNo() != chapterNo) {
            throw ApiException.badRequest("Không đổi được chapterNo; hãy xóa rồi thêm chương mới");
        }
        Chapter chapter = toChapter(request, chapterNo);
        Update update = new Update().set("chapters.$", chapter).set("updatedAt", Instant.now());
        requireChapterMatched(bookId, chapterNo, mongoTemplate.updateFirst(chapterQuery(bookId, chapterNo), update,
                Book.class));
        return ChapterSummary.from(chapter);
    }

    public void deleteChapter(String bookId, int chapterNo) {
        requireObjectId(bookId);
        Update update = new Update()
                .pull("chapters", new Document("chapterNo", chapterNo))
                .set("updatedAt", Instant.now());
        requireChapterMatched(bookId, chapterNo, mongoTemplate.updateFirst(chapterQuery(bookId, chapterNo), update,
                Book.class));
    }

    private Query filter(String category, String keyword) {
        Query filter = StringUtils.hasText(keyword)
                ? TextQuery.queryText(TextCriteria.forDefaultLanguage().matching(keyword.trim())).sortByScore()
                : new Query();
        if (StringUtils.hasText(category)) {
            filter.addCriteria(where("categories").is(category.trim()));
        }
        return filter;
    }

    private int nextChapterNo(String bookId) {
        Query numbersQuery = byId(bookId);
        numbersQuery.fields().include("chapters.chapterNo");
        Book book = mongoTemplate.findOne(numbersQuery, Book.class);
        if (book == null) {
            throw bookNotFound(bookId);
        }
        return book.getChapters().stream().mapToInt(Chapter::chapterNo).max().orElse(0) + 1;
    }

    private void requireChapterMatched(String bookId, int chapterNo, UpdateResult result) {
        if (result.getMatchedCount() == 0) {
            throw exists(bookId) ? chapterNotFound(bookId, chapterNo) : bookNotFound(bookId);
        }
    }

    private static void applyMetadata(Book book, BookRequest request) {
        book.setTitle(request.title().trim());
        book.setAuthor(request.author().trim());
        book.setCategories(normalizeCategories(request.categories()));
        book.setDescription(StringUtils.hasText(request.description()) ? request.description().trim() : null);
        book.setCoverUrl(StringUtils.hasText(request.coverUrl()) ? request.coverUrl().trim() : null);
    }

    private static List<String> normalizeCategories(List<String> categories) {
        if (categories == null) {
            return new ArrayList<>();
        }
        return new ArrayList<>(categories.stream().map(String::trim).collect(Collectors.toCollection(LinkedHashSet::new)));
    }

    private static List<Chapter> toChapters(List<ChapterRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return new ArrayList<>();
        }
        Set<Integer> used = new HashSet<>();
        int next = 1;
        List<Chapter> chapters = new ArrayList<>();
        for (ChapterRequest request : requests) {
            int chapterNo = request.chapterNo() != null ? request.chapterNo() : next;
            if (!used.add(chapterNo)) {
                throw ApiException.badRequest("chapterNo " + chapterNo + " bị trùng");
            }
            next = Math.max(next, chapterNo) + 1;
            chapters.add(toChapter(request, chapterNo));
        }
        chapters.sort((a, b) -> Integer.compare(a.chapterNo(), b.chapterNo()));
        return chapters;
    }

    private static Chapter toChapter(ChapterRequest request, int chapterNo) {
        List<Section> sections = new ArrayList<>();
        if (request.sections() != null) {
            Set<Integer> used = new HashSet<>();
            int next = 1;
            for (SectionRequest section : request.sections()) {
                int sectionNo = section.sectionNo() != null ? section.sectionNo() : next;
                if (!used.add(sectionNo)) {
                    throw ApiException.badRequest("sectionNo " + sectionNo + " bị trùng trong chương " + chapterNo);
                }
                next = Math.max(next, sectionNo) + 1;
                sections.add(new Section(sectionNo, section.heading(), section.text()));
            }
            sections.sort((a, b) -> Integer.compare(a.sectionNo(), b.sectionNo()));
        }
        String content = request.content() == null ? "" : request.content();
        return new Chapter(chapterNo, request.title().trim(), content, sections);
    }

    private static void setOrUnset(Update update, String field, Object value) {
        if (value == null) {
            update.unset(field);
        } else {
            update.set(field, value);
        }
    }

    /** Danh sách chỉ cần số chương, bỏ toàn văn để giảm dữ liệu truyền đi. */
    private static void excludeChapterBodies(Query target) {
        target.fields().exclude("chapters.content", "chapters.sections", "chapters.title");
    }

    /** Chi tiết giữ mục lục (tên chương, tiêu đề mục) nhưng không trả toàn văn. */
    private static void excludeChapterContent(Query target) {
        target.fields().exclude("chapters.content", "chapters.sections.text");
    }

    private static Query byId(String bookId) {
        return query(where("_id").is(new ObjectId(bookId)));
    }

    private static Query chapterQuery(String bookId, int chapterNo) {
        return query(where("_id").is(new ObjectId(bookId)).and("chapters.chapterNo").is(chapterNo));
    }

    private static String requireObjectId(String bookId) {
        if (!ObjectId.isValid(bookId)) {
            throw bookNotFound(bookId);
        }
        return bookId;
    }

    private static ApiException bookNotFound(String bookId) {
        return ApiException.notFound("Không tìm thấy sách " + bookId);
    }

    private static ApiException chapterNotFound(String bookId, int chapterNo) {
        return ApiException.notFound("Không tìm thấy chương " + chapterNo + " của sách " + bookId);
    }
}
