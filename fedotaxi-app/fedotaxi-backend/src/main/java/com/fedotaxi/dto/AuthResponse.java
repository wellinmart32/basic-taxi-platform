package com.fedotaxi.dto;
import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class AuthResponse {
    
    private String jwt;
    private String role;
    private Long userId;
    
    /**
     * Constructor estático para creación simplificada
     */
    public static AuthResponse of(String jwt, String role, Long userId) {
        return new AuthResponse(jwt, role, userId);
    }
    
    /**
     * Validar que la respuesta contiene datos requeridos
     */
    public boolean isValid() {
        return jwt != null && !jwt.trim().isEmpty() &&
               role != null && !role.trim().isEmpty() &&
               userId != null && userId > 0;
    }
    
    /**
     * Información para logging sin exponer JWT completo por seguridad
     */
    public String getLogInfo() {
        return String.format("AuthResponse{role='%s', userId=%d, jwtLength=%d}", 
                           role, userId, jwt != null ? jwt.length() : 0);
    }
}
