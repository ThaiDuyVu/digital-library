package vn.edu.huit.digitallibrary.suggestion.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.stereotype.Component;
import vn.edu.huit.digitallibrary.common.MongoSchemaSupport;
import vn.edu.huit.digitallibrary.suggestion.model.BookSuggestion;

@Component
@Order(1)
public class SuggestionMongoInitializer implements ApplicationRunner {

    private final MongoTemplate mongo;

    public SuggestionMongoInitializer(MongoTemplate mongo) {
        this.mongo = mongo;
    }

    @Override
    public void run(ApplicationArguments args) {
        MongoSchemaSupport.applyValidator(mongo, BookSuggestion.COLLECTION, "mongo/book_suggestions.schema.json");
        mongo.indexOps(BookSuggestion.class).createIndex(new Index().on("createdAt", Sort.Direction.DESC)
                .on("_id", Sort.Direction.DESC).named("ix_suggestions_newest"));
    }
}
