package com.fedotaxi.service.interfaces;
import com.fedotaxi.model.User;
import com.fedotaxi.model.UserRole;
import com.fedotaxi.dto.UserDTO;
import com.fedotaxi.dto.UserUpdateDTO;
import java.util.List;
import java.util.Optional;

/**
 * Servicio para gestión completa de usuarios del sistema
 */
public interface UserService {
    
    /**
     * Listar todos los usuarios con información básica
     */
    List<UserDTO> getAllUsers();
    
    /**
     * Buscar usuario por email único
     */
    Optional<User> getUserByEmail(String email);
    
    /**
     * Buscar usuario por ID
     */
    Optional<User> getUserById(Long userId);
    
    /**
     * Filtrar usuarios por rol específico
     */
    List<User> getUsersByRole(UserRole role);
    
    /**
     * Actualizar datos del usuario con validación
     */
    User updateUser(User user, UserUpdateDTO updateDTO);
    
    /**
     * Cambiar estado activo/inactivo del usuario
     */
    User updateUserStatus(Long userId, boolean active);
    
    /**
     * Verificar disponibilidad de email antes del registro
     */
    boolean existsByEmail(String email);
    
    /**
     * Convertir entidad a DTO ocultando información sensible
     */
    UserDTO convertToDTO(User user);
}
