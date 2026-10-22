package vn.edu.huit.digitallibrary.identity.repository;

import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.identity.model.User;

public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByUsername(String username);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    boolean existsByRole(Role role);

    long countByRole(Role role);
}
