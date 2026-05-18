package com.ecommerce.userservice.oauth;

import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.entity.UserRole;
import com.ecommerce.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class OAuth2UserLinkService {

    private final UserIdentityRepository userIdentityRepository;
    private final UserRepository userRepository;

    @Transactional
    public User findOrCreate(String provider, String sub, String email, String name) {
        // 1. Look up by (provider, sub) — already linked
        return userIdentityRepository.findByProviderAndProviderSubject(provider, sub)
                .map(UserIdentity::getUser)
                .orElseGet(() -> linkOrCreateUser(provider, sub, email, name));
    }

    private User linkOrCreateUser(String provider, String sub, String email, String name) {
        // 2. Existing user by email → link identity
        User user = userRepository.findByEmail(email)
                .orElseGet(() -> createNewUser(email, name));

        UserIdentity identity = UserIdentity.builder()
                .user(user)
                .provider(provider)
                .providerSubject(sub)
                .build();
        userIdentityRepository.save(identity);

        log.info("Linked {} identity for user {}", provider, user.getEmail());
        return user;
    }

    private User createNewUser(String email, String name) {
        User user = User.builder()
                .email(email)
                .fullName(name != null ? name : email)
                .passwordHash(null)
                .role(UserRole.CUSTOMER)
                .enabled(true)
                .emailVerified(true)
                .build();
        return userRepository.save(user);
    }
}
