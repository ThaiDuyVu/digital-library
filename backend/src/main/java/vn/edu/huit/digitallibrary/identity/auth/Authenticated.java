package vn.edu.huit.digitallibrary.identity.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Yêu cầu header {@code Authorization: Bearer <token>} hợp lệ; thiếu hoặc sai trả 401. */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface Authenticated {
}
