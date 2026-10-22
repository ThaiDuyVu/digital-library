package vn.edu.huit.digitallibrary.identity.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.IndexOperations;
import org.springframework.stereotype.Component;
import vn.edu.huit.digitallibrary.common.MongoSchemaSupport;
import vn.edu.huit.digitallibrary.identity.model.User;

/** Tạo validator và index cho collection users; chạy lặp lại an toàn mỗi lần khởi động. */
@Component
@Order(1)
public class IdentityMongoInitializer implements ApplicationRunner {

    private final MongoTemplate mongoTemplate;

    public IdentityMongoInitializer(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        MongoSchemaSupport.applyValidator(mongoTemplate, User.COLLECTION, "mongo/users.schema.json");
        IndexOperations indexes = mongoTemplate.indexOps(User.COLLECTION);
        indexes.createIndex(new Index().on("username", Sort.Direction.ASC).unique().named("ux_users_username"));
        indexes.createIndex(new Index().on("email", Sort.Direction.ASC).unique().named("ux_users_email"));
    }
}
