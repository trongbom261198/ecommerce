package com.ecommerce.userservice.oauth;

import com.ecommerce.userservice.dto.AuthResponse;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.hibernate.validator.internal.util.stereotypes.Lazy;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class OAuth2LoginSuccessHandler implements AuthenticationSuccessHandler {

    private final OAuth2UserLinkService linkService;
    @Autowired
    @Lazy
    private final AuthService authService;

    @Value("${app.oauth2.fe-redirect-base:http://localhost:5173/oauth/callback}")
    private String feRedirectBase;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        OAuth2User oauth2User = (OAuth2User) authentication.getPrincipal();

        String email = oauth2User.getAttribute("email");
        Boolean emailVerified = oauth2User.getAttribute("email_verified");

        if (!Boolean.TRUE.equals(emailVerified)) {
            log.warn("OAuth2 login rejected — email not verified for: {}", email);
            response.sendRedirect(feRedirectBase + "?error=email_not_verified");
            return;
        }

        String sub = oauth2User.getAttribute("sub");
        String name = oauth2User.getAttribute("name");

        try {
            User user = linkService.findOrCreate("GOOGLE", sub, email, name);
            AuthResponse tokens = authService.issueTokens(user);

            String fragment = "#access=" + tokens.getAccessToken()
                    + "&refresh=" + tokens.getRefreshToken()
                    + "&exp=" + tokens.getExpiresIn();

            response.sendRedirect(feRedirectBase + fragment);
        } catch (Exception e) {
            log.error("OAuth2 login failed for sub={}", sub, e);
            response.sendRedirect(feRedirectBase + "?error=oauth_failed");
        }
    }
}
