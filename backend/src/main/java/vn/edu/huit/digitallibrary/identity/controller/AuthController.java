package vn.edu.huit.digitallibrary.identity.controller;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.edu.huit.digitallibrary.identity.auth.AuthInterceptor;
import vn.edu.huit.digitallibrary.identity.auth.Authenticated;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.identity.dto.LoginRequest;
import vn.edu.huit.digitallibrary.identity.dto.LoginResponse;
import vn.edu.huit.digitallibrary.identity.dto.UserResponse;
import vn.edu.huit.digitallibrary.identity.service.UserService;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserService userService;

    public AuthController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return userService.login(request);
    }

    @Authenticated
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request) {
        AuthInterceptor.bearerToken(request).ifPresent(userService::logout);
    }

    @Authenticated
    @GetMapping("/me")
    public UserResponse me(CurrentUser currentUser) {
        return userService.get(currentUser.id());
    }
}
