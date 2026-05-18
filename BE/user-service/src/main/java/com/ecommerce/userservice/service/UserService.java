package com.ecommerce.userservice.service;

import com.ecommerce.common.exception.BusinessException;
import com.ecommerce.userservice.dto.*;
import com.ecommerce.userservice.entity.Address;
import com.ecommerce.userservice.entity.User;
import com.ecommerce.userservice.repository.AddressRepository;
import com.ecommerce.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final AddressRepository addressRepository;
    private final PasswordEncoder passwordEncoder;

    public UserResponse getProfile(UUID userId) {
        User user = findUserById(userId);
        return mapToUserResponse(user);
    }

    @Transactional
    public UserResponse updateProfile(UUID userId, UpdateProfileRequest request) {
        User user = findUserById(userId);

        if (request.getFullName() != null && !request.getFullName().isBlank()) {
            user.setFullName(request.getFullName());
        }
        if (request.getPhone() != null && !request.getPhone().isBlank()) {
            if (!request.getPhone().equals(user.getPhone())
                    && userRepository.existsByPhone(request.getPhone())) {
                throw new BusinessException(409, "PHONE_EXISTS", "Phone number is already in use");
            }
            user.setPhone(request.getPhone());
        }

        user = userRepository.save(user);
        return mapToUserResponse(user);
    }

    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest request) {
        User user = findUserById(userId);

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new BusinessException(400, "WRONG_PASSWORD", "Current password is incorrect");
        }

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    public List<AddressResponse> getAddresses(UUID userId) {
        findUserById(userId);
        return addressRepository.findByUserId(userId).stream()
                .map(this::mapToAddressResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public AddressResponse addAddress(UUID userId, AddressRequest request) {
        User user = findUserById(userId);

        if (request.isDefault()) {
            clearDefaultAddress(userId);
        }

        Address address = Address.builder()
                .user(user)
                .label(request.getLabel())
                .recipientName(request.getRecipientName())
                .phone(request.getPhone())
                .streetAddress(request.getStreetAddress())
                .ward(request.getWard())
                .district(request.getDistrict())
                .province(request.getProvince())
                .country(request.getCountry() != null ? request.getCountry() : "VN")
                .postalCode(request.getPostalCode())
                .latitude(request.getLatitude())
                .longitude(request.getLongitude())
                .isDefault(request.isDefault())
                .build();

        address = addressRepository.save(address);
        return mapToAddressResponse(address);
    }

    @Transactional
    public AddressResponse updateAddress(UUID userId, UUID addressId, AddressRequest request) {
        Address address = findAddressForUser(userId, addressId);

        if (request.isDefault()) {
            clearDefaultAddress(userId);
        }

        address.setLabel(request.getLabel());
        address.setRecipientName(request.getRecipientName());
        address.setPhone(request.getPhone());
        address.setStreetAddress(request.getStreetAddress());
        address.setWard(request.getWard());
        address.setDistrict(request.getDistrict());
        address.setProvince(request.getProvince());
        if (request.getCountry() != null) {
            address.setCountry(request.getCountry());
        }
        address.setPostalCode(request.getPostalCode());
        address.setLatitude(request.getLatitude());
        address.setLongitude(request.getLongitude());
        address.setDefault(request.isDefault());

        address = addressRepository.save(address);
        return mapToAddressResponse(address);
    }

    @Transactional
    public void deleteAddress(UUID userId, UUID addressId) {
        Address address = findAddressForUser(userId, addressId);
        addressRepository.delete(address);
    }

    @Transactional
    public void setDefaultAddress(UUID userId, UUID addressId) {
        findUserById(userId);
        Address address = findAddressForUser(userId, addressId);

        clearDefaultAddress(userId);

        address.setDefault(true);
        addressRepository.save(address);
    }

    private void clearDefaultAddress(UUID userId) {
        addressRepository.findByUserIdAndIsDefaultTrue(userId)
                .ifPresent(existing -> {
                    existing.setDefault(false);
                    addressRepository.save(existing);
                });
    }

    private User findUserById(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(404, "USER_NOT_FOUND", "User not found"));
    }

    private Address findAddressForUser(UUID userId, UUID addressId) {
        Address address = addressRepository.findById(addressId)
                .orElseThrow(() -> new BusinessException(404, "ADDRESS_NOT_FOUND", "Address not found"));

        if (!address.getUser().getId().equals(userId)) {
            throw new BusinessException(403, "ACCESS_DENIED", "Access denied to this address");
        }

        return address;
    }

    private UserResponse mapToUserResponse(User user) {
        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .phone(user.getPhone())
                .fullName(user.getFullName())
                .role(user.getRole())
                .enabled(user.isEnabled())
                .createdAt(user.getCreatedAt())
                .build();
    }

    private AddressResponse mapToAddressResponse(Address address) {
        return AddressResponse.builder()
                .id(address.getId())
                .label(address.getLabel())
                .recipientName(address.getRecipientName())
                .phone(address.getPhone())
                .streetAddress(address.getStreetAddress())
                .ward(address.getWard())
                .district(address.getDistrict())
                .province(address.getProvince())
                .country(address.getCountry())
                .postalCode(address.getPostalCode())
                .latitude(address.getLatitude())
                .longitude(address.getLongitude())
                .isDefault(address.isDefault())
                .createdAt(address.getCreatedAt())
                .build();
    }
}
