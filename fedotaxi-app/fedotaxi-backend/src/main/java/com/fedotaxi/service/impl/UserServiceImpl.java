package com.fedotaxi.service.impl;

import com.fedotaxi.dto.UserDTO;
import com.fedotaxi.dto.UserUpdateDTO;
import com.fedotaxi.model.User;
import com.fedotaxi.model.UserRole;
import com.fedotaxi.repository.UserRepository;
import com.fedotaxi.service.interfaces.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
public class UserServiceImpl implements UserService {

    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;

    @Override
    public List<UserDTO> getAllUsers() {
        System.out.println("Obteniendo todos los usuarios");
        List<User> users = userRepository.findAll();
        return users.stream()
                .map(this::convertToDTO)
                .collect(Collectors.toList());
    }

    @Override
    public Optional<User> getUserByEmail(String email) {
        System.out.println("Buscando usuario por email: " + email);
        if (email == null || email.trim().isEmpty()) {
            System.out.println("Email vacío o nulo");
            return Optional.empty();
        }
        return userRepository.findByEmail(email.trim());
    }

    @Override
    public Optional<User> getUserById(Long userId) {
        System.out.println("Buscando usuario por ID: " + userId);
        if (userId == null || userId <= 0) {
            System.out.println("ID de usuario inválido: " + userId);
            return Optional.empty();
        }
        return userRepository.findById(userId);
    }

    @Override
    public List<User> getUsersByRole(UserRole role) {
        System.out.println("Buscando usuarios por rol: " + role);
        if (role == null) {
            System.out.println("Rol nulo proporcionado");
            return List.of();
        }
        return userRepository.findByRole(role);
    }

    /**
     * Actualizar campos específicos del usuario con validación
     */
    @Override
    public User updateUser(User user, UserUpdateDTO updateDTO) {
        System.out.println("Actualizando usuario: " + user.getId());
        
        if (user == null || updateDTO == null) {
            throw new IllegalArgumentException("Usuario y datos de actualización no pueden ser nulos");
        }

        boolean hasChanges = false;

        if (updateDTO.getFirstName() != null && !updateDTO.getFirstName().trim().isEmpty()) {
            String newFirstName = updateDTO.getFirstName().trim();
            if (!newFirstName.equals(user.getFirstName())) {
                user.setFirstName(newFirstName);
                hasChanges = true;
                System.out.println("Nombre actualizado para usuario " + user.getId());
            }
        }

        if (updateDTO.getLastName() != null && !updateDTO.getLastName().trim().isEmpty()) {
            String newLastName = updateDTO.getLastName().trim();
            if (!newLastName.equals(user.getLastName())) {
                user.setLastName(newLastName);
                hasChanges = true;
                System.out.println("Apellido actualizado para usuario " + user.getId());
            }
        }

        if (updateDTO.getPhone() != null && !updateDTO.getPhone().trim().isEmpty()) {
            String newPhone = updateDTO.getPhone().trim();
            if (!newPhone.equals(user.getPhone())) {
                if (isValidPhone(newPhone)) {
                    user.setPhone(newPhone);
                    hasChanges = true;
                    System.out.println("Teléfono actualizado para usuario " + user.getId());
                } else {
                    System.out.println("Teléfono inválido: " + newPhone);
                    throw new IllegalArgumentException("Formato de teléfono inválido");
                }
            }
        }

        if (updateDTO.getPassword() != null && !updateDTO.getPassword().isEmpty()) {
            if (isValidPassword(updateDTO.getPassword())) {
                String encodedPassword = passwordEncoder.encode(updateDTO.getPassword());
                user.setPassword(encodedPassword);
                hasChanges = true;
                System.out.println("Contraseña actualizada para usuario " + user.getId());
            } else {
                System.out.println("Contraseña no cumple con los requisitos");
                throw new IllegalArgumentException("La contraseña debe tener al menos 6 caracteres");
            }
        }

        if (!hasChanges) {
            System.out.println("No hay cambios que actualizar para usuario " + user.getId());
            return user;
        }

        User updatedUser = userRepository.save(user);
        System.out.println("Usuario actualizado exitosamente: " + updatedUser.getId());
        return updatedUser;
    }

    @Override
    public User updateUserStatus(Long userId, boolean active) {
        System.out.println("Actualizando estado del usuario " + userId + " a: " + active);
        
        if (userId == null || userId <= 0) {
            throw new IllegalArgumentException("ID de usuario inválido");
        }

        Optional<User> userOpt = userRepository.findById(userId);
        if (userOpt.isEmpty()) {
            System.out.println("Usuario no encontrado para actualizar estado: " + userId);
            throw new RuntimeException("Usuario no encontrado");
        }

        User user = userOpt.get();
        
        if (user.isActive() == active) {
            System.out.println("El usuario " + userId + " ya tiene el estado: " + active);
            return user;
        }

        user.setActive(active);
        User updatedUser = userRepository.save(user);
        
        System.out.println("Estado del usuario " + userId + " actualizado a: " + active);
        return updatedUser;
    }

    @Override
    public boolean existsByEmail(String email) {
        if (email == null || email.trim().isEmpty()) {
            return false;
        }
        boolean exists = userRepository.existsByEmail(email.trim());
        System.out.println("Email " + email + " existe: " + exists);
        return exists;
    }

    /**
     * Convertir User entity a DTO ocultando datos sensibles como password
     */
    @Override
    public UserDTO convertToDTO(User user) {
        if (user == null) {
            System.out.println("Intento de convertir usuario nulo a DTO");
            return null;
        }

        try {
            UserDTO dto = new UserDTO();
            dto.setId(user.getId());
            dto.setEmail(user.getEmail());
            dto.setFirstName(user.getFirstName());
            dto.setLastName(user.getLastName());
            dto.setPhone(user.getPhone());
            dto.setRole(user.getRole());
            dto.setActive(user.isActive());
            
            return dto;
            
        } catch (Exception e) {
            System.out.println("Error convirtiendo User a DTO para ID " + 
                             user.getId() + ": " + e.getMessage());
            throw new RuntimeException("Error convirtiendo datos del usuario", e);
        }
    }

    /**
     * Validar formato internacional de teléfono (7-15 dígitos)
     */
    private boolean isValidPhone(String phone) {
        if (phone == null || phone.trim().isEmpty()) {
            return false;
        }
        
        String cleanPhone = phone.trim().replaceAll("[\\s\\-\\(\\)]", "");
        
        return cleanPhone.matches("\\+?[0-9]{7,15}");
    }

    /**
     * Validar longitud mínima de contraseña
     */
    private boolean isValidPassword(String password) {
        return password != null && password.length() >= 6;
    }
}
