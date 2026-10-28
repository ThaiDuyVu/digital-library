package vn.edu.huit.digitallibrary.common;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Mọi lỗi API phải là {code,message} theo docs/SHARED.md, kể cả khi thiếu query param bắt buộc. */
class GlobalExceptionHandlerTest {
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new ProbeController())
            .setControllerAdvice(new GlobalExceptionHandler()).build();

    @RestController
    static class ProbeController {
        @GetMapping("/probe")
        String probe(@RequestParam int chapterNo) {
            return String.valueOf(chapterNo);
        }
    }

    @Test
    void missingRequiredParameterKeepsSharedErrorShape() throws Exception {
        mvc.perform(get("/probe")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.message").value("Thiếu tham số bắt buộc: chapterNo"))
                .andExpect(jsonPath("$.error").doesNotExist())
                .andExpect(jsonPath("$.path").doesNotExist());
    }

    @Test
    void wrongParameterTypeKeepsSharedErrorShape() throws Exception {
        mvc.perform(get("/probe").param("chapterNo", "abc")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("BAD_REQUEST"))
                .andExpect(jsonPath("$.message").value("Dữ liệu gửi lên không đúng định dạng"));
    }
}
