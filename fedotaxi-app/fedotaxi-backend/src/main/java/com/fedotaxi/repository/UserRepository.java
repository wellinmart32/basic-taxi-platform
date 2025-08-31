package com.fedotaxi.repository;

import com.fedotaxi.model.User;
import com.fedotaxi.model.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    
    /**
     * Buscar usuario por email
     */
    Optional<User> findByEmail(String email);
    
    /**
     * Buscar usuarios por rol
     */
    List<User> findByRole(UserRole role);
    
    /**
     * Verificar si existe un usuario con el email especificado
     */
    Boolean existsByEmail(String email);
}
