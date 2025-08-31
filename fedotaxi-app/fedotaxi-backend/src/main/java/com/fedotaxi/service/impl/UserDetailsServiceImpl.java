package com.fedotaxi.service.impl;

import com.fedotaxi.model.User;
import com.fedotaxi.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Collections;

@Service
public class UserDetailsServiceImpl implements UserDetailsService {
    
    @Autowired
    private UserRepository userRepository;
    
    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        System.out.println("🔍 [USER-DETAILS-SERVICE] Cargando usuario: " + email);
        
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> {
                    System.out.println("❌ [USER-DETAILS-SERVICE] Usuario no encontrado: " + email);
                    return new UsernameNotFoundException("Usuario no encontrado: " + email);
                });
        
        // Verificar si el usuario está activo
        if (!user.isActive()) {
            System.out.println("❌ [USER-DETAILS-SERVICE] Usuario inactivo: " + email);
            throw new UsernameNotFoundException("Usuario inactivo: " + email);
        }
        
        System.out.println("✅ [USER-DETAILS-SERVICE] Usuario cargado exitosamente: " + email + 
                          " (Rol: " + user.getRole() + ")");
        
        return new org.springframework.security.core.userdetails.User(
                user.getEmail(),
                user.getPassword(),
                user.isActive(),     // enabled
                true,                // accountNonExpired
                true,                // credentialsNonExpired
                true,                // accountNonLocked
                Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + user.getRole().name()))
        );
    }
}
