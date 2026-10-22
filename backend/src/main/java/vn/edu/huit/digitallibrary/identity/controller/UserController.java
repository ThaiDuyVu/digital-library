package vn.edu.huit.digitallibrary.identity.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import vn.edu.huit.digitallibrary.common.ApiException;
import vn.edu.huit.digitallibrary.identity.auth.Authenticated;
import vn.edu.huit.digitallibrary.identity.auth.CurrentUser;
import vn.edu.huit.digitallibrary.identity.dto.RegisterRequest;
import vn.edu.huit.digitallibrary.identity.dto.UpdateUserRequest;
import vn.edu.huit.digitallibrary.identity.dto.UserResponse;
import vn.edu.huit.digitallibrary.identity.service.UserService;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest request) {
        return userService.register(request);
    }

    @Authenticated
    @GetMapping("/{userId}")
    public UserResponse get(@PathVariable String userId, CurrentUser currentUser) {
        requireAccess(currentUser, userId);
        return userService.get(userId);
    }

    @Authenticated
    @PutMapping("/{userId}")
    public UserResponse update(@PathVariable String userId, @Valid @RequestBody UpdateUserRequest request,
            CurrentUser currentUser) {
        requireAccess(currentUser, userId);
        return userService.update(userId, request);
    }

    @Authenticated
    @DeleteMapping("/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String userId, CurrentUser currentUser) {
        requireAccess(currentUser, userId);
        userService.delete(userId);
    }

    private static void requireAccess(CurrentUser currentUser, String userId) {
        if (!currentUser.canAccess(userId)) {
            throw ApiException.forbidden("Không có quyền với tài khoản " + userId);
        }
    }
}
