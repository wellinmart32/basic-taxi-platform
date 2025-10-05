import { TripStatus } from '../../enums/trip-status.enum';

export interface Trip {
  id: number;
  passengerId: number;
  driverId?: number;
  originAddress: string;
  destinationAddress: string;
  originLatitude: number;
  originLongitude: number;
  destinationLatitude: number;
  destinationLongitude: number;
  status: TripStatus;
  distance?: number;
  fare?: number;
  requestTime: Date;
  acceptTime?: Date;
  startTime?: Date;
  endTime?: Date;
  driverName?: string;
  driverPhone?: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  passengerName?: string;
}
