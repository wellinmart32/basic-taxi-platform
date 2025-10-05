export interface Driver {
  id: number;
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  licenseNumber: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleYear?: string;
  available: boolean;
  currentLatitude?: number;
  currentLongitude?: number;
  
  // Campos calculados en frontend
  distance?: number;
  distanceToOrigin?: number;
}
