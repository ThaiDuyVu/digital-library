package vn.edu.huit.digitallibrary.identity.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import vn.edu.huit.digitallibrary.common.ApiException;

@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return CurrentUser.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        Object user = webRequest.getNativeRequest(HttpServletRequest.class)
                .getAttribute(AuthInterceptor.CURRENT_USER_ATTRIBUTE);
        if (user == null) {
            // Controller khai báo CurrentUser nhưng quên gắn @Authenticated/@AdminOnly
            throw ApiException.unauthorized("Cần đăng nhập");
        }
        return user;
    }
}
