package com.fedotaxi.controller;

import com.fedotaxi.dto.UserDTO;
import com.fedotaxi.dto.UserUpdateDTO;
import com.fedotaxi.model.User;
import com.fedotaxi.service.interfaces.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserService userService;

    /**
     * Obtener todos los usuarios (solo admin)
     */
    @GetMapping
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<?> getAllUsers() {
        try {
            List<UserDTO> users = userService.getAllUsers();
            System.out.println("✅ Admin obtuvo " + users.size() + " usuarios");
            return ResponseEntity.ok(users);
        } catch (Exception e) {
            System.out.println("❌ Error en getAllUsers: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error obteniendo usuarios: " + e.getMessage());
        }
    }

    /**
     * Obtener información del usuario actual
     */
    @GetMapping("/me")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_DRIVER') or hasRole('ROLE_PASSENGER')")
    public ResponseEntity<?> getCurrentUser() {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();
            
            Optional<User> userOpt = userService.getUserByEmail(userEmail);
            if (userOpt.isEmpty()) {
                System.out.println("❌ Usuario no encontrado: " + userEmail);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Usuario no encontrado");
            }
            
            UserDTO userDTO = userService.convertToDTO(userOpt.get());
            System.out.println("✅ Información del usuario obtenida: " + userEmail);
            return ResponseEntity.ok(userDTO);
            
        } catch (Exception e) {
            System.out.println("❌ Error en getCurrentUser: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error obteniendo usuario actual: " + e.getMessage());
        }
    }

    /**
     * Actualizar información del usuario actual
     */
    @PutMapping("/me")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_DRIVER') or hasRole('ROLE_PASSENGER')")
    public ResponseEntity<?> updateCurrentUser(@RequestBody UserUpdateDTO userUpdateDTO) {
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userEmail = authentication.getName();
            
            Optional<User> userOpt = userService.getUserByEmail(userEmail);
            if (userOpt.isEmpty()) {
                System.out.println("❌ Usuario no encontrado para actualizar: " + userEmail);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Usuario no encontrado");
            }
            
            User updatedUser = userService.updateUser(userOpt.get(), userUpdateDTO);
            UserDTO userDTO = userService.convertToDTO(updatedUser);
            
            System.out.println("✅ Usuario actualizado: " + userEmail);
            return ResponseEntity.ok(userDTO);
            
        } catch (Exception e) {
            System.out.println("❌ Error actualizando usuario: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error actualizando usuario: " + e.getMessage());
        }
    }

    /**
     * Obtener usuario por ID (solo admin)
     */
    @GetMapping("/{userId}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<?> getUserById(@PathVariable Long userId) {
        try {
            Optional<User> userOpt = userService.getUserById(userId);
            if (userOpt.isEmpty()) {
                System.out.println("❌ Usuario no encontrado por ID: " + userId);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Usuario no encontrado");
            }
            
            UserDTO userDTO = userService.convertToDTO(userOpt.get());
            System.out.println("✅ Usuario obtenido por ID: " + userId);
            return ResponseEntity.ok(userDTO);
            
        } catch (Exception e) {
            System.out.println("❌ Error obteniendo usuario por ID " + userId + ": " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error obteniendo usuario: " + e.getMessage());
        }
    }

    /**
     * Actualizar estado activo/inactivo del usuario (solo admin)
     */
    @PutMapping("/{userId}/status")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<?> updateUserStatus(@PathVariable Long userId, @RequestParam boolean active) {
        try {
            User updatedUser = userService.updateUserStatus(userId, active);
            UserDTO userDTO = userService.convertToDTO(updatedUser);
            
            System.out.println("✅ Estado del usuario " + userId + " actualizado a: " + active);
            return ResponseEntity.ok(userDTO);
            
        } catch (RuntimeException e) {
            System.out.println("❌ Error actualizando estado del usuario " + userId + ": " + e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(e.getMessage());
        } catch (Exception e) {
            System.out.println("❌ Error interno actualizando estado: " + e.getMessage());
            return ResponseEntity.internalServerError()
                    .body("Error actualizando estado del usuario: " + e.getMessage());
        }
    }
}
