package com.fedotaxi.controller;

import com.fedotaxi.dto.AuthRequest;
import com.fedotaxi.dto.AuthResponse;
import com.fedotaxi.dto.RegisterRequest;
import com.fedotaxi.model.Driver;
import com.fedotaxi.model.User;
import com.fedotaxi.model.UserRole;
import com.fedotaxi.repository.DriverRepository;
import com.fedotaxi.repository.UserRepository;
import com.fedotaxi.security.JwtUtil;
import com.fedotaxi.service.impl.UserDetailsServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private UserDetailsServiceImpl userDetailsService;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private DriverRepository driverRepository;
    
    @Autowired
    private PasswordEncoder passwordEncoder;

    /**
     * Autenticar usuario y generar token JWT
     */
    @PostMapping("/login")
    public ResponseEntity<?> authenticate(@RequestBody AuthRequest authRequest) {
        try {
            System.out.println("🔑 Intento de login: " + authRequest.getEmail());
            
            // Validar datos básicos
            if (authRequest.getEmail() == null || authRequest.getPassword() == null ||
                authRequest.getEmail().trim().isEmpty() || authRequest.getPassword().trim().isEmpty()) {
                System.out.println("❌ Credenciales vacías");
                return ResponseEntity.badRequest().body("Email y contraseña son requeridos");
            }

            // Autenticar con credenciales
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(authRequest.getEmail(), authRequest.getPassword())
            );

            // Obtener detalles de usuario para generar el token
            final UserDetails userDetails = userDetailsService.loadUserByUsername(authRequest.getEmail());
            
            // Obtener el usuario de la base de datos
            User user = userRepository.findByEmail(authRequest.getEmail())
                    .orElseThrow(() -> new BadCredentialsException("Usuario no encontrado"));
            
            // Generar token
            final String jwt = jwtUtil.generateToken(userDetails);
            
            // Crear respuesta
            AuthResponse response = AuthResponse.of(jwt, user.getRole().name(), user.getId());
            
            // Validar respuesta
            if (!response.isValid()) {
                System.out.println("❌ Respuesta de autenticación inválida");
                return ResponseEntity.internalServerError().body("Error generando respuesta de autenticación");
            }
            
            System.out.println("✅ Login exitoso: " + authRequest.getEmail() + 
                             " (Rol: " + user.getRole() + ")");
            
            return ResponseEntity.ok(response);
            
        } catch (BadCredentialsException e) {
            System.out.println("❌ Credenciales incorrectas: " + authRequest.getEmail());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Credenciales incorrectas");
        } catch (Exception e) {
            System.out.println("❌ Error durante autenticación: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error durante la autenticación: " + e.getMessage());
        }
    }

    /**
     * Registrar nuevo usuario y crear perfil asociado
     */
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest registerRequest) {
        try {
            System.out.println("📝 Intento de registro: " + registerRequest.getEmail() + 
                             " (Rol: " + registerRequest.getRole() + ")");
            
            // Validaciones básicas
            if (!isValidRegisterRequest(registerRequest)) {
                System.out.println("❌ Datos de registro inválidos");
                return ResponseEntity.badRequest().body("Datos de registro inválidos");
            }

            // Verificar si el email ya está registrado
            if (userRepository.existsByEmail(registerRequest.getEmail())) {
                System.out.println("❌ Email ya registrado: " + registerRequest.getEmail());
                return ResponseEntity.badRequest().body("Email ya registrado");
            }

            // Crear el usuario
            User user = createUserFromRequest(registerRequest);
            User savedUser = userRepository.save(user);
            
            // Si es un conductor, crear también el perfil del conductor
            if (registerRequest.getRole() == UserRole.DRIVER) {
                Driver driver = createDriverFromRequest(registerRequest, savedUser);
                driverRepository.save(driver);
                System.out.println("✅ Perfil de conductor creado: " + savedUser.getId());
            }
            
            // Generar token
            final UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
            final String jwt = jwtUtil.generateToken(userDetails);
            
            // Crear respuesta
            AuthResponse response = AuthResponse.of(jwt, user.getRole().name(), user.getId());
            
            System.out.println("✅ Usuario registrado: " + registerRequest.getEmail() + 
                             " (ID: " + savedUser.getId() + ")");
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            System.out.println("❌ Error durante registro: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Error durante el registro: " + e.getMessage());
        }
    }

    /**
     * Validar datos de la solicitud de registro
     */
    private boolean isValidRegisterRequest(RegisterRequest request) {
        // Validar campos básicos
        if (request.getEmail() == null || request.getEmail().trim().isEmpty() ||
            request.getPassword() == null || request.getPassword().trim().isEmpty() ||
            request.getFirstName() == null || request.getFirstName().trim().isEmpty() ||
            request.getLastName() == null || request.getLastName().trim().isEmpty() ||
            request.getPhone() == null || request.getPhone().trim().isEmpty() ||
            request.getRole() == null) {
            return false;
        }
        
        // Validar email básico
        if (!request.getEmail().contains("@") || !request.getEmail().contains(".")) {
            return false;
        }
        
        // Validar contraseña mínima
        if (request.getPassword().length() < 6) {
            return false;
        }
        
        // Validar campos específicos para conductores
        if (request.getRole() == UserRole.DRIVER) {
            if (request.getLicenseNumber() == null || request.getLicenseNumber().trim().isEmpty() ||
                request.getVehiclePlate() == null || request.getVehiclePlate().trim().isEmpty() ||
                request.getVehicleModel() == null || request.getVehicleModel().trim().isEmpty()) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Crear entidad User a partir de RegisterRequest
     */
    private User createUserFromRequest(RegisterRequest request) {
        User user = new User();
        user.setEmail(request.getEmail().trim());
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        user.setFirstName(request.getFirstName().trim());
        user.setLastName(request.getLastName().trim());
        user.setPhone(request.getPhone().trim());
        user.setRole(request.getRole());
        user.setActive(true);
        return user;
    }
    
    /**
     * Crear entidad Driver a partir de RegisterRequest
     */
    private Driver createDriverFromRequest(RegisterRequest request, User user) {
        Driver driver = new Driver();
        driver.setUser(user);
        driver.setLicenseNumber(request.getLicenseNumber().trim());
        driver.setVehiclePlate(request.getVehiclePlate().trim());
        driver.setVehicleModel(request.getVehicleModel().trim());
        driver.setVehicleYear(request.getVehicleYear());
        driver.setAvailable(false);
        return driver;
    }
}
