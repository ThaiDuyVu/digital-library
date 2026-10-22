package vn.edu.huit.digitallibrary.identity.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import vn.edu.huit.digitallibrary.identity.model.Role;
import vn.edu.huit.digitallibrary.identity.repository.UserRepository;
import vn.edu.huit.digitallibrary.identity.service.UserService;

/** Tạo tài khoản quản trị đầu tiên từ app.admin.* nếu hệ thống chưa có admin. */
@Component
@Order(2)
public class AdminAccountInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminAccountInitializer.class);

    private final UserRepository users;
    private final UserService userService;
    private final String username;
    private final String password;
    private final String email;

    public AdminAccountInitializer(UserRepository users, UserService userService,
            @Value("${app.admin.username}") String username,
            @Value("${app.admin.password}") String password,
            @Value("${app.admin.email}") String email) {
        this.users = users;
        this.userService = userService;
        this.username = username;
        this.password = password;
        this.email = email;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!users.existsByRole(Role.ADMIN)) {
            userService.createAdmin(username, email, password);
            log.info("Đã tạo tài khoản quản trị '{}'", username);
        }
    }
}
