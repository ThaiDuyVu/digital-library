package vn.edu.huit.digitallibrary.reading;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.Duration;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInfo;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import vn.edu.huit.digitallibrary.identity.service.UserService;
import org.bson.Document;

/** Opt in only against the dedicated Mongo database and Redis DB documented in HANDOFF. */
@EnabledIfEnvironmentVariable(named = "DAT_INTEGRATION_TESTS", matches = "true")
@SpringBootTest
@AutoConfigureMockMvc
@Import(DatRedisIntegrationTest.EvidenceConfiguration.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class DatRedisIntegrationTest {
    private static final List<Document> requests = Collections.synchronizedList(new ArrayList<>());
    private final List<Document> snapshots = new ArrayList<>();
    private boolean completed;
    @Autowired MockMvc mvc;
    @Autowired StringRedisTemplate redis;
    @Autowired UserService users;

    @TestConfiguration(proxyBeanMethods = false)
    static class EvidenceConfiguration {
        @Bean
        MockMvcBuilderCustomizer datEvidenceRecorder() {
            return builder -> builder.alwaysDo(result -> {
                var request = result.getRequest();
                String uri = request.getRequestURI();
                // Never persist login/register bodies, cookies or Authorization headers.
                if (!uri.startsWith("/api/progress") && !uri.startsWith("/api/ranking")
                        && !uri.startsWith("/api/books")) return;
                requests.add(new Document("method", request.getMethod()).append("path", uri)
                        .append("query", request.getQueryString())
                        .append("requestBody", request.getContentAsString())
                        .append("status", result.getResponse().getStatus())
                        .append("responseBody", result.getResponse().getContentAsString()));
            });
        }
    }

    @AfterEach
    void saveEvidence(TestInfo testInfo) throws Exception {
        Path output = Path.of(System.getenv().getOrDefault("DAT_ACCEPTANCE_OUTPUT", "../output/acceptance"));
        Files.createDirectories(output);
        String evidence = new Document("time", Instant.now().toString())
                .append("completed", completed).append("transport", "MockMvc full Spring context; real Mongo/Redis/login")
                .append("requests", new ArrayList<>(requests)).append("snapshots", snapshots).toJson();
        Files.writeString(output.resolve("api-redis-evidence.json"), evidence);
        Files.writeString(output.resolve(testInfo.getTestMethod().orElseThrow().getName() + "-evidence.json"), evidence);
        requests.clear();
    }

    private void snapshot(String phase, String key) {
        Document hash = new Document();
        redis.opsForHash().entries(key).forEach((k, v) -> hash.append(k.toString(), v));
        var ranking = redis.opsForZSet().reverseRangeWithScores("ranking:books", 0, -1);
        snapshots.add(new Document("phase", phase).append("key", key).append("hash", hash)
                .append("ttl", redis.getExpire(key)).append("ranking", ranking == null ? List.of() : ranking.stream()
                        .map(e -> new Document("bookId", e.getValue()).append("score", e.getScore())).toList()));
    }

    @Test
    @Order(1)
    void progressAndRankingWithRealLoginMongoAndRedis() throws Exception {
        requests.clear();
        // Dedicated, initially empty Redis DB is required: fail safely rather than clearing it.
        assertThat(redis.hasKey("ranking:books")).as("Use a fresh dedicated Redis DB; never FLUSHDB").isFalse();
        mvc.perform(get("/api/ranking")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String user = register("dat_a_" + suffix);
        String other = register("dat_b_" + suffix);
        String token = login("dat_a_" + suffix);
        String otherToken = login("dat_b_" + suffix);
        String adminName = "dat_admin_" + suffix;
        users.createAdmin(adminName, adminName + "@example.test", "fixture-password");
        String admin = login(adminName);
        String book = createBook(admin, "Dat fixture A " + suffix);
        String second = createBook(admin, "Dat fixture B " + suffix);
        String path = "/api/progress/" + user + "/" + book;
        String key = "progress:" + user + ":" + book;

        mvc.perform(get(path).header("Authorization", "Bearer " + token)).andExpect(status().isNotFound());
        mvc.perform(save(path, token, 3, 30, 0)).andExpect(status().isOk())
                .andExpect(jsonPath("$.chapter").value(3)).andExpect(jsonPath("$.page").value(30));
        Map<Object, Object> original = redis.opsForHash().entries(key);
        assertThat(original).hasSize(4).containsEntry("chapter", "3").containsEntry("page", "30").containsEntry("line", "0");
        assertThat(Instant.parse((String) original.get("updatedAt"))).isBeforeOrEqualTo(Instant.now());
        assertThat(redis.getExpire(key)).isEqualTo(-1L);
        mvc.perform(get(path).header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.updatedAt").value(original.get("updatedAt")));
        snapshot("P01 saved chapter3 page30 line0", key);

        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(save(path, "invalid-token", 1, 1, 0)).andExpect(status().isUnauthorized());
        mvc.perform(get(path).header("Authorization", "Bearer " + otherToken)).andExpect(status().isForbidden());
        mvc.perform(save(path, otherToken, 1, 1, 0)).andExpect(status().isForbidden());
        mvc.perform(get(path).header("Authorization", "Bearer " + admin)).andExpect(status().isOk());
        assertThat(redis.opsForHash().entries(key)).isEqualTo(original);
        snapshot("P03 rejected requests leave original hash", key);
        for (String body : List.of("{}", "{", "{\"chapter\":null,\"page\":1,\"line\":0}",
                "{\"chapter\":0,\"page\":1,\"line\":0}", "{\"chapter\":1,\"page\":0,\"line\":0}",
                "{\"chapter\":1,\"page\":1,\"line\":-1}", "{\"chapter\":\"bad\",\"page\":1,\"line\":0}",
                "{\"chapter\":1.5,\"page\":1,\"line\":0}", "{\"chapter\":1,\"page\":\"30\",\"line\":0}")) {
            mvc.perform(put(path).header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("BAD_REQUEST"));
        }
        mvc.perform(save(path, token, 99, 30, 0)).andExpect(status().isNotFound());
        assertThat(redis.opsForHash().entries(key)).isEqualTo(original);
        snapshot("P04 invalid JSON and P06 absent chapter leave original hash", key);

        mvc.perform(save("/api/progress/" + other + "/" + second, admin, 1, 10, 2)).andExpect(status().isOk());
        var untouched = redis.opsForHash().entries("progress:" + other + ":" + second);
        mvc.perform(save(path, token, 1, 31, 2)).andExpect(status().isOk());
        mvc.perform(get(path).header("Authorization", "Bearer " + token)).andExpect(status().isOk())
                .andExpect(jsonPath("$.page").value(31)).andExpect(jsonPath("$.line").value(2));
        assertThat(redis.opsForHash().entries(key)).hasSize(4).containsEntry("page", "31");
        assertThat(redis.opsForHash().entries("progress:" + other + ":" + second)).isEqualTo(untouched);
        snapshot("P02 overwrite same pair", key);
        snapshot("P02 other pair unchanged", "progress:" + other + ":" + second);
        for (String missing : List.of("invalid-id", "000000000000000000000000")) {
            mvc.perform(save("/api/progress/" + user + "/" + missing, token, 1, 1, 0))
                    .andExpect(status().isNotFound());
            assertThat(redis.hasKey("progress:" + user + ":" + missing)).isFalse();
            mvc.perform(save("/api/progress/" + missing + "/" + book, admin, 1, 1, 0))
                    .andExpect(status().isNotFound());
            assertThat(redis.hasKey("progress:" + missing + ":" + book)).isFalse();
            mvc.perform(read(missing, token, 1)).andExpect(status().isNotFound());
            assertThat(redis.opsForZSet().score("ranking:books", missing)).isNull();
        }

        mvc.perform(read(book, token, 1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.score").value(1));
        snapshot("R01 score null to 1", key);
        int count = 40;
        var pool = Executors.newFixedThreadPool(8);
        try {
            List<Callable<Integer>> calls = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                calls.add(() -> mvc.perform(read(book, token, 1)).andReturn().getResponse().getStatus());
            }
            for (var result : pool.invokeAll(calls)) {
                assertThat(result.get()).isEqualTo(200);
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(redis.opsForZSet().score("ranking:books", book)).isEqualTo(1D);
        snapshot("R02 40 duplicate concurrent opens keep score 1 in the 60s window", key);
        mvc.perform(read(book, token, 3)).andExpect(status().isOk());
        mvc.perform(read(second, token, 1)).andExpect(status().isOk());
        mvc.perform(get("/api/ranking")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2)).andExpect(jsonPath("$[0].bookId").value(book))
                .andExpect(jsonPath("$[0].score").value(2));
        mvc.perform(get("/api/ranking?top=1")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/ranking?top=100")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        redis.opsForZSet().add("ranking:books", second, 2);
        String tieFirst = book.compareTo(second) > 0 ? book : second;
        mvc.perform(get("/api/ranking")).andExpect(jsonPath("$[0].bookId").value(tieFirst));
        snapshot("R04 tie follows Redis descending member", key);
        for (String top : List.of("0", "-1", "101", "abc", "1.5")) {
            mvc.perform(get("/api/ranking").param("top", top)).andExpect(status().isBadRequest());
        }
        // Exercise the default limit with more than ten real books, not just a two-item list.
        for (int i = 0; i < 10; i++) {
            String extra = createBook(admin, "Dat ranking limit " + suffix + " " + i);
            mvc.perform(read(extra, token, 1)).andExpect(status().isOk());
        }
        String topBody = mvc.perform(get("/api/ranking")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(10)).andReturn().getResponse().getContentAsString();
        List<String> actualIds = JsonPath.read(topBody, "$[*].bookId");
        assertThat(actualIds).containsExactlyElementsOf(redis.opsForZSet().reverseRange("ranking:books", 0, 9));
        mvc.perform(get("/api/ranking?top=100")).andExpect(jsonPath("$.length()").value(12));
        snapshot("R03 default top10 compared with Redis among 12 books", key);
        // Remove only the book created by this test; leave existing data untouched.
        var rankingBeforeDelete = redis.opsForZSet().reverseRangeWithScores("ranking:books", 0, -1);
        mvc.perform(delete("/api/books/" + second).header("Authorization", "Bearer " + admin))
                .andExpect(status().isNoContent());
        assertThat(redis.opsForZSet().score("ranking:books", second)).isNull();
        assertThat(redis.hasKey("progress:" + other + ":" + second)).isFalse();
        assertThat(redis.opsForHash().entries(key)).containsEntry("page", "31");
        assertThat(redis.opsForZSet().reverseRangeWithScores("ranking:books", 0, -1))
                .containsExactlyElementsOf(rankingBeforeDelete.stream()
                        .filter(entry -> !second.equals(entry.getValue())).toList());
        var rankingAfterDelete = redis.opsForZSet().reverseRangeWithScores("ranking:books", 0, -1);
        mvc.perform(read(second, token, 1)).andExpect(status().isNotFound());
        assertThat(redis.opsForZSet().reverseRangeWithScores("ranking:books", 0, -1)).isEqualTo(rankingAfterDelete);
        mvc.perform(get("/api/books/batch").param("ids", second + "," + book))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(book));
        snapshot("R05 deletion removes owned book ranking/progress; rejected read leaves remaining ZSET unchanged", key);
        // IDs are evidence only. Never print tokens or passwords.
        System.out.printf("DAT_EVIDENCE userA=%s userB=%s bookA=%s bookB=%s concurrentSuccess=%d score=2 TTL=%d%n",
                user, other, book, second, count, redis.getExpire(key));
        completed = true;
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "DAT_REVIEW_TESTS", matches = "true")
    void objectIdAliasesMustShareProgressAndRanking() throws Exception {
        assertThat(redis.hasKey("ranking:books")).as("Use a fresh dedicated Redis instance").isFalse();
        String name = "dat_review_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        users.createAdmin(name, name + "@example.test", "fixture-password");
        String admin = login(name);
        String user = register(name + "_user");
        String token = login(name + "_user");
        String book = createBook(admin, "Independent review " + name);
        String alias = book.toUpperCase(java.util.Locale.ROOT);
        assertThat(alias).isNotEqualTo(book);
        String canonicalPath = "/api/progress/" + user + "/" + book;
        mvc.perform(save(canonicalPath, token, 1, 10, 0)).andExpect(status().isOk());
        mvc.perform(save("/api/progress/" + user + "/" + alias, token, 1, 30, 0))
                .andExpect(status().isOk());
        String restored = mvc.perform(get(canonicalPath).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        mvc.perform(read(book, token, 1)).andExpect(status().isOk());
        mvc.perform(read(alias, token, 3)).andExpect(status().isOk())
                .andExpect(jsonPath("$.bookId").value(book)).andExpect(jsonPath("$.score").value(2));
        String ranking = mvc.perform(get("/api/ranking")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        mvc.perform(get("/api/books/batch").param("ids", alias)).andExpect(status().isOk());
        snapshot("REVIEW canonical ObjectId", "progress:" + user + ":" + book);
        snapshot("REVIEW uppercase alias of same ObjectId", "progress:" + user + ":" + alias);
        Integer page = JsonPath.read(restored, "$.page");
        List<String> rankedIds = JsonPath.read(ranking, "$[*].bookId");
        mvc.perform(get("/api/books/batch").param("ids", String.join(",", rankedIds)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(book));
        org.junit.jupiter.api.Assertions.assertAll(
                () -> assertThat(page).as("Same Mongo book must restore last saved page").isEqualTo(30),
                () -> assertThat(rankedIds).as("Same Mongo book must have one ranking member").containsExactly(book),
                () -> assertThat(redis.opsForZSet().score("ranking:books", book))
                        .as("Both reads must increment the same book").isEqualTo(2D));
        assertThat(redis.hasKey("progress:" + user + ":" + alias)).isFalse();
        assertThat(redis.opsForZSet().score("ranking:books", alias)).isNull();
        mvc.perform(get("/api/progress/" + user + "/" + alias).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(30));
        completed = true;
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "DAT_REVIEW_TESTS", matches = "true")
    void userIdAliasesShareProgressAndKeepAuthorization() throws Exception {
        assertThat(redis.hasKey("ranking:books")).isFalse();
        String name = "dat_alias_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        users.createAdmin(name, name + "@example.test", "fixture-password");
        String admin = login(name);
        String user = register(name + "_user");
        String token = login(name + "_user");
        String book = createBook(admin, "User alias regression " + name);
        String upperUser = user.toUpperCase(java.util.Locale.ROOT);
        String upperBook = book.toUpperCase(java.util.Locale.ROOT);
        String path = "/api/progress/" + user + "/" + book;
        String aliasPath = "/api/progress/" + upperUser + "/" + upperBook;
        mvc.perform(save(aliasPath, token, 3, 30, 2)).andExpect(status().isOk());
        mvc.perform(get(path).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(30));
        mvc.perform(save(aliasPath, admin, 1, 42, 3)).andExpect(status().isOk());
        mvc.perform(get(aliasPath).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.page").value(42));
        String key = "progress:" + user + ":" + book;
        var before = redis.opsForHash().entries(key);
        String other = register(name + "_other");
        String otherToken = login(name + "_other");
        mvc.perform(save(aliasPath, otherToken, 1, 99, 0)).andExpect(status().isForbidden());
        mvc.perform(get(aliasPath).header("Authorization", "Bearer " + otherToken)).andExpect(status().isForbidden());
        mvc.perform(get("/api/progress/not-an-id/" + book).header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/progress/not-an-id/" + book).header("Authorization", "Bearer " + admin))
                .andExpect(status().isNotFound());
        mvc.perform(save("/api/progress/" + upperUser + "/not-an-id", token, 1, 1, 0))
                .andExpect(status().isNotFound());
        assertThat(redis.opsForHash().entries(key)).isEqualTo(before);
        for (String userVariant : List.of(user, upperUser)) {
            for (String bookVariant : List.of(book, upperBook)) {
                if (!userVariant.equals(user) || !bookVariant.equals(book)) {
                    assertThat(redis.hasKey("progress:" + userVariant + ":" + bookVariant)).isFalse();
                }
            }
        }
        // Legacy data is read canonically in DTOs, but not merged, deleted or rewritten.
        redis.opsForZSet().add("ranking:books", upperBook, 7);
        mvc.perform(get("/api/ranking")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].bookId").value(book)).andExpect(jsonPath("$[0].score").value(7));
        assertThat(redis.opsForZSet().score("ranking:books", upperBook)).isEqualTo(7D);
        assertThat(redis.opsForZSet().score("ranking:books", book)).isNull();
        snapshot("USER_ALIAS owner/admin and forbidden unchanged; legacy ranking read leaves data intact", key);
        snapshot("USER_ALIAS uppercase Hash absent", "progress:" + upperUser + ":" + upperBook);
        completed = true;
    }

    @Test
    void progressListWithRealMongoRedisAndAuthorization() throws Exception {
        String name = "dat_list_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String user = register(name);
        String other = register(name + "_other");
        String token = login(name);
        String otherToken = login(name + "_other");
        users.createAdmin(name + "_admin", name + "_admin@example.test", "fixture-password");
        String admin = login(name + "_admin");
        String first = createBook(admin, "Progress list first " + name);
        String recent = createBook(admin, "Progress list recent " + name);
        mvc.perform(get("/api/progress/" + user)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/progress/" + user).header("Authorization", "Bearer " + otherToken))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/progress/" + user).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(save("/api/progress/" + user + "/" + first, token, 1, 10, 0)).andExpect(status().isOk());
        mvc.perform(save("/api/progress/" + other + "/" + first, otherToken, 1, 20, 0)).andExpect(status().isOk());
        mvc.perform(save("/api/progress/" + user + "/" + recent, token, 3, 30, 2)).andExpect(status().isOk());
        String orphan = "000000000000000000000000";
        redis.opsForHash().putAll("progress:" + user + ":" + orphan, Map.of(
                "chapter", "1", "page", "1", "line", "0", "updatedAt", Instant.now().toString()));
        String aliasKey = "progress:" + user + ":" + recent.toUpperCase(java.util.Locale.ROOT);
        redis.opsForHash().putAll(aliasKey, Map.of(
                "chapter", "3", "page", "99", "line", "0", "updatedAt", Instant.now().toString()));
        for (String accessToken : List.of(token, admin)) {
            mvc.perform(get("/api/progress/" + user.toUpperCase(java.util.Locale.ROOT))
                            .header("Authorization", "Bearer " + accessToken))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                    .andExpect(jsonPath("$[0].bookId").value(recent))
                    .andExpect(jsonPath("$[0].page").value(30)).andExpect(jsonPath("$[0].line").value(2))
                    .andExpect(jsonPath("$[1].bookId").value(first));
        }
        mvc.perform(get("/api/progress/not-an-id").header("Authorization", "Bearer " + admin))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/progress/000000000000000000000000").header("Authorization", "Bearer " + admin))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/books/" + recent).header("Authorization", "Bearer " + admin))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/progress/" + user).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].bookId").value(first));
        assertThat(redis.hasKey("progress:" + user + ":" + orphan)).isTrue();
        assertThat(redis.opsForHash().get(aliasKey, "page")).isEqualTo("99");
        snapshot("LIST owner/admin aliases; orphan excluded without modifying data", "progress:" + user + ":" + first);
        completed = true;
    }

    @Test
    void deduplicatedReadsWithRealRedisAndLogin() throws Exception {
        String name = "dat_lock_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        String user = register(name);
        String other = register(name + "_other");
        String token = login(name);
        String otherToken = login(name + "_other");
        users.createAdmin(name + "_admin", name + "_admin@example.test", "fixture-password");
        String book = createBook(login(name + "_admin"), "Dedupe " + name);
        mvc.perform(post("/api/books/" + book + "/read").param("chapterNo", "1"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/books/" + book + "/read").header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
        mvc.perform(read(book, token, 99)).andExpect(status().isNotFound());
        assertThat(redis.hasKey("read-lock:" + user + ":" + book + ":99")).isFalse();
        int count = 40;
        var pool = Executors.newFixedThreadPool(8);
        try {
            List<Callable<Integer>> calls = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                calls.add(() -> mvc.perform(read(book, token, 1)).andReturn().getResponse().getStatus());
            }
            for (var result : pool.invokeAll(calls)) assertThat(result.get()).isEqualTo(200);
        } finally {
            pool.shutdownNow();
        }
        assertThat(redis.opsForZSet().score("ranking:books", book)).isEqualTo(1D);
        String lock = "read-lock:" + user + ":" + book + ":1";
        Long ttl = redis.getExpire(lock);
        assertThat(ttl).isBetween(50L, 60L);
        mvc.perform(read(book.toUpperCase(java.util.Locale.ROOT), token, 1)).andExpect(status().isOk())
                .andExpect(jsonPath("$.bookId").value(book)).andExpect(jsonPath("$.score").value(1));
        assertThat(redis.getExpire(lock)).isLessThanOrEqualTo(ttl);
        assertThat(redis.hasKey("read-lock:" + user + ":" + book.toUpperCase(java.util.Locale.ROOT) + ":1")).isFalse();
        mvc.perform(read(book, token, 3)).andExpect(status().isOk()).andExpect(jsonPath("$.score").value(2));
        mvc.perform(read(book, otherToken, 1)).andExpect(status().isOk()).andExpect(jsonPath("$.score").value(3));
        assertThat(redis.hasKey("read-lock:" + other + ":" + book + ":1")).isTrue();
        snapshot("DEDUPE 40 concurrent opens count once; alias unchanged; other chapter/user count separately", "progress:" + user + ":" + book);
        // Shorten only this test-owned lock to exercise real Redis expiration without waiting 60 seconds.
        redis.expire(lock, Duration.ofMillis(50));
        long deadline = System.nanoTime() + Duration.ofSeconds(2).toNanos();
        while (redis.hasKey(lock) && System.nanoTime() < deadline) Thread.sleep(10);
        assertThat(redis.hasKey(lock)).isFalse();
        mvc.perform(read(book, token, 1)).andExpect(status().isOk()).andExpect(jsonPath("$.score").value(4));
        assertThat(redis.getExpire(lock)).isBetween(50L, 60L);
        snapshot("DEDUPE after real lock expiration a new open increments and creates a 60s lock", "progress:" + user + ":" + book);
        completed = true;
    }

    private MockHttpServletRequestBuilder read(String bookId, String token, int chapterNo) {
        return post("/api/books/" + bookId + "/read").param("chapterNo", Integer.toString(chapterNo))
                .header("Authorization", "Bearer " + token);
    }

    private String register(String username) throws Exception {
        String body = "{\"username\":\"" + username + "\",\"email\":\"" + username
                + "@example.test\",\"password\":\"fixture-password\"}";
        String response = mvc.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.id");
    }

    private String login(String username) throws Exception {
        String response = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + username + "\",\"password\":\"fixture-password\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.token");
    }

    private String createBook(String admin, String title) throws Exception {
        String body = "{\"title\":\"" + title + "\",\"author\":\"Dat integration\",\"categories\":[],"
                + "\"chapters\":[{\"chapterNo\":1,\"title\":\"One\"},{\"chapterNo\":3,\"title\":\"Three\"}]}";
        String response = mvc.perform(post("/api/books").header("Authorization", "Bearer " + admin)
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.id");
    }

    private MockHttpServletRequestBuilder save(String path, String token, int chapter, int page, int line) {
        return put(path).header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"chapter\":" + chapter + ",\"page\":" + page + ",\"line\":" + line + "}");
    }
}
