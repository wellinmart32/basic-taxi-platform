import { UserRole } from '../../enums/user-role.enum';

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: UserRole;
  
  // Campos específicos para conductores
  licenseNumber?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  vehicleYear?: string;
}
