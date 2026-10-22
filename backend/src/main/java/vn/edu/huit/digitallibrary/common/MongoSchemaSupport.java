package vn.edu.huit.digitallibrary.common;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import org.bson.Document;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.mongodb.core.MongoTemplate;

/** Áp JSON Schema validator lưu trong {@code resources/mongo/*.schema.json} cho một collection. */
public final class MongoSchemaSupport {

    private MongoSchemaSupport() {
    }

    public static void applyValidator(MongoTemplate mongoTemplate, String collection, String schemaResource) {
        Document validator = Document.parse(readResource(schemaResource));
        if (!mongoTemplate.collectionExists(collection)) {
            mongoTemplate.getDb().createCollection(collection);
        }
        mongoTemplate.getDb().runCommand(new Document("collMod", collection)
                .append("validator", validator)
                .append("validationLevel", "strict")
                .append("validationAction", "error"));
    }

    private static String readResource(String path) {
        try {
            return new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new UncheckedIOException("Không đọc được schema " + path, ex);
        }
    }
}
