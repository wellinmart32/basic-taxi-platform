import { UserRole } from '../../enums/user-role.enum';

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: UserRole;
  active: boolean;
}
