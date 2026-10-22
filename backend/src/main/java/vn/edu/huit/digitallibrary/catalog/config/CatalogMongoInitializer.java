package vn.edu.huit.digitallibrary.catalog.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.IndexOperations;
import org.springframework.data.mongodb.core.index.TextIndexDefinition;
import org.springframework.stereotype.Component;
import vn.edu.huit.digitallibrary.catalog.model.Book;
import vn.edu.huit.digitallibrary.common.MongoSchemaSupport;

/** Tạo validator và index cho collection books; chạy lặp lại an toàn mỗi lần khởi động. */
@Component
@Order(1)
public class CatalogMongoInitializer implements ApplicationRunner {

    private final MongoTemplate mongoTemplate;

    public CatalogMongoInitializer(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        MongoSchemaSupport.applyValidator(mongoTemplate, Book.COLLECTION, "mongo/books.schema.json");
        IndexOperations indexes = mongoTemplate.indexOps(Book.COLLECTION);
        // default_language "none": không stemming/stop-word tiếng Anh để tìm được tiêu đề tiếng Việt
        indexes.createIndex(TextIndexDefinition.builder()
                .named("tx_books_title_author")
                .onField("title", 10F)
                .onField("author", 5F)
                .withDefaultLanguage("none")
                .build());
        indexes.createIndex(new Index().on("categories", Sort.Direction.ASC).named("ix_books_categories"));
        indexes.createIndex(new Index().on("createdAt", Sort.Direction.DESC).named("ix_books_createdAt"));
    }
}
