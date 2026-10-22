package vn.edu.huit.digitallibrary.identity.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.lang.annotation.Annotation;
import java.util.Optional;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import vn.edu.huit.digitallibrary.common.ApiException;
import vn.edu.huit.digitallibrary.identity.service.UserService;

/** Kiểm tra {@link Authenticated} và {@link AdminOnly}; endpoint không gắn annotation thì công khai. */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    static final String CURRENT_USER_ATTRIBUTE = CurrentUser.class.getName();
    private static final String BEARER_PREFIX = "Bearer ";

    private final UserService userService;

    public AuthInterceptor(UserService userService) {
        this.userService = userService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) {
            return true;
        }
        boolean adminOnly = hasAnnotation(method, AdminOnly.class);
        if (!adminOnly && !hasAnnotation(method, Authenticated.class)) {
            return true;
        }
        CurrentUser user = bearerToken(request)
                .flatMap(userService::authenticate)
                .orElseThrow(() -> ApiException.unauthorized("Cần đăng nhập"));
        if (adminOnly && !user.isAdmin()) {
            throw ApiException.forbidden("Chỉ quản trị viên được thực hiện thao tác này");
        }
        request.setAttribute(CURRENT_USER_ATTRIBUTE, user);
        return true;
    }

    public static Optional<String> bearerToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header == null || !header.startsWith(BEARER_PREFIX) || header.length() == BEARER_PREFIX.length()) {
            return Optional.empty();
        }
        return Optional.of(header.substring(BEARER_PREFIX.length()).trim());
    }

    private static boolean hasAnnotation(HandlerMethod method, Class<? extends Annotation> type) {
        return method.hasMethodAnnotation(type) || AnnotatedElementUtils.hasAnnotation(method.getBeanType(), type);
    }
}
