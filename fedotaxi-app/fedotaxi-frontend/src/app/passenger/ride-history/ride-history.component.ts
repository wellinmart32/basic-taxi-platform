import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TripService } from '../../core/services/trip/trip.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { Trip } from '../../core/models/trip/Trip.model';
import { TripStatus } from '../../core/enums/trip-status.enum';

@Component({
  selector: 'app-ride-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ride-history.component.html',
  styleUrls: ['./ride-history.component.scss']
})
export class RideHistoryComponent implements OnInit {
  
  // Datos principales
  trips: Trip[] = [];
  filteredTrips: Trip[] = [];
  isLoading = true;
  errorMessage = '';
  
  // Filtros y búsqueda
  selectedFilter: 'all' | 'completed' | 'cancelled' = 'all';
  searchTerm = '';
  sortBy: 'date' | 'fare' | 'distance' = 'date';
  sortOrder: 'asc' | 'desc' = 'desc';
  
  // Paginación
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 0;
  
  // Estadísticas calculadas
  totalTrips = 0;
  completedTrips = 0;
  cancelledTrips = 0;
  totalDistance = 0;
  totalFare = 0;
  
  // Referencias para el template
  TripStatus = TripStatus;
  
  // Usuario actual
  isPassenger = false;
  isDriver = false;
  currentUserId: number | null = null;

  constructor(
    private tripService: TripService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    console.log('📋 Iniciando componente de historial');
    
    this.isPassenger = this.authService.isPassenger();
    this.isDriver = this.authService.isDriver();
    this.currentUserId = this.authService.getCurrentUserId();
    
    this.loadTripHistory();
  }

  /**
   * Cargar historial con ordenamiento
   */
  loadTripHistory() {
    console.log('📋 Cargando historial de viajes');
    
    this.tripService.getMyTrips().subscribe({
      next: (trips) => {
        // Filtrar solo viajes completados y cancelados para el historial
        this.trips = trips.filter(trip => 
          trip.status === TripStatus.COMPLETED || 
          trip.status === TripStatus.CANCELLED
        );
        
        this.applySorting();
        this.applyAllFilters();
        this.calculateStatistics();
        this.isLoading = false;
        
        console.log(`✅ Historial cargado: ${this.trips.length} viajes`);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('❌ Error cargando historial:', error);
        this.errorMessage = 'Error al cargar el historial de viajes';
      }
    });
  }

  /**
   * Aplicar ordenamiento a los viajes
   */
  private applySorting() {
    this.trips.sort((a, b) => {
      let comparison = 0;
      
      switch (this.sortBy) {
        case 'date':
          const dateA = new Date(a.endTime || a.requestTime).getTime();
          const dateB = new Date(b.endTime || b.requestTime).getTime();
          comparison = dateA - dateB;
          break;
          
        case 'fare':
          comparison = (a.fare || 0) - (b.fare || 0);
          break;
          
        case 'distance':
          comparison = (a.distance || 0) - (b.distance || 0);
          break;
      }
      
      return this.sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Cambiar criterio de ordenamiento
   */
  changeSorting(newSortBy: 'date' | 'fare' | 'distance') {
    if (this.sortBy === newSortBy) {
      // Cambiar orden si es la misma columna
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      // Nueva columna con orden descendente
      this.sortBy = newSortBy;
      this.sortOrder = 'desc';
    }
    
    this.applySorting();
    this.applyAllFilters();
    
    console.log(`🔄 Ordenamiento: ${this.sortBy} ${this.sortOrder}`);
  }

  /**
   * Aplicar todos los filtros y paginación
   */
  private applyAllFilters() {
    let filtered = [...this.trips];
    
    // Filtro de estado
    if (this.selectedFilter === 'completed') {
      filtered = filtered.filter(trip => trip.status === TripStatus.COMPLETED);
    } else if (this.selectedFilter === 'cancelled') {
      filtered = filtered.filter(trip => trip.status === TripStatus.CANCELLED);
    }
    
    // Filtro de búsqueda
    if (this.searchTerm.trim()) {
      filtered = this.applySearch(filtered, this.searchTerm);
    }
    
    // Calcular paginación
    this.totalPages = Math.ceil(filtered.length / this.itemsPerPage);
    this.currentPage = Math.min(this.currentPage, this.totalPages || 1);
    
    // Aplicar paginación
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    this.filteredTrips = filtered.slice(startIndex, endIndex);
    
    console.log(`🔍 Filtros aplicados: ${filtered.length} de ${this.trips.length} viajes`);
  }

  /**
   * Cambiar página de resultados
   */
  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.applyAllFilters();
    }
  }

  /**
   * Obtener páginas visibles para paginación
   */
  getVisiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    
    // Ajustar start si end está en el límite
    start = Math.max(1, end - maxVisible + 1);
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  /**
   * Calcular estadísticas del historial
   */
  private calculateStatistics() {
    this.totalTrips = this.trips.length;
    this.completedTrips = this.trips.filter(trip => trip.status === TripStatus.COMPLETED).length;
    this.cancelledTrips = this.trips.filter(trip => trip.status === TripStatus.CANCELLED).length;
    
    // Calcular totales solo de viajes completados
    const completedTripsList = this.trips.filter(trip => trip.status === TripStatus.COMPLETED);
    
    this.totalDistance = completedTripsList.reduce((total, trip) => {
      return total + (trip.distance || 0);
    }, 0);
    
    this.totalFare = completedTripsList.reduce((total, trip) => {
      return total + (trip.fare || 0);
    }, 0);
    
    console.log(`📊 Estadísticas: ${this.totalTrips} total, ${this.completedTrips} completados`);
  }

  /**
   * Aplicar filtro de estado con reset de paginación
   */
  applyFilter(filter: 'all' | 'completed' | 'cancelled') {
    this.selectedFilter = filter;
    this.currentPage = 1;
    
    console.log(`🔍 Filtro aplicado: ${filter}`);
    this.applyAllFilters();
  }

  /**
   * Manejar entrada de búsqueda
   */
  onSearchInput(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.currentPage = 1;
    
    console.log(`🔍 Búsqueda: ${this.searchTerm}`);
    this.applyAllFilters();
  }

  /**
   * Limpiar búsqueda
   */
  clearSearch() {
    this.searchTerm = '';
    this.currentPage = 1;
    this.applyAllFilters();
  }

  /**
   * Aplicar lógica de búsqueda en múltiples campos
   */
  private applySearch(trips: Trip[], searchTerm: string): Trip[] {
    const term = searchTerm.toLowerCase().trim();
    
    return trips.filter(trip => {
      // Búsqueda en direcciones
      const originMatch = trip.originAddress?.toLowerCase().includes(term);
      const destinationMatch = trip.destinationAddress?.toLowerCase().includes(term);
      
      // Búsqueda en información del conductor/pasajero
      const driverMatch = trip.driverName?.toLowerCase().includes(term);
      const passengerMatch = trip.passengerName?.toLowerCase().includes(term);
      
      // Búsqueda en información del vehículo
      const vehicleMatch = trip.vehicleModel?.toLowerCase().includes(term) ||
                          trip.vehiclePlate?.toLowerCase().includes(term);
      
      // Búsqueda por ID
      const idMatch = trip.id.toString().includes(term);
      
      return originMatch || destinationMatch || driverMatch || 
             passengerMatch || vehicleMatch || idMatch;
    });
  }

  /**
   * Ver detalles de un viaje
   */
  viewTripDetails(trip: Trip) {
    console.log(`👁️ Ver detalles del viaje: ${trip.id}`);
    this.router.navigate(['/trip-status', trip.id]);
  }

  /**
   * Solicitar nuevo viaje
   */
  requestNewTrip() {
    this.router.navigate(['/request-trip']);
  }

  /**
   * Volver al home
   */
  goHome() {
    this.router.navigate(['/home']);
  }

  /**
   * Refrescar historial
   */
  refreshHistory() {
    console.log('🔄 Refrescando historial');
    this.isLoading = true;
    this.errorMessage = '';
    this.loadTripHistory();
  }

  // ===== MÉTODOS PARA EL TEMPLATE =====

  /**
   * Obtener icono del estado
   */
  getStatusIcon(status: TripStatus): string {
    switch (status) {
      case TripStatus.COMPLETED:
        return 'fas fa-check-circle text-success';
      case TripStatus.CANCELLED:
        return 'fas fa-times-circle text-danger';
      default:
        return 'fas fa-question-circle text-muted';
    }
  }

  /**
   * Obtener texto del estado
   */
  getStatusText(status: TripStatus): string {
    switch (status) {
      case TripStatus.COMPLETED:
        return 'Completado';
      case TripStatus.CANCELLED:
        return 'Cancelado';
      default:
        return 'Desconocido';
    }
  }

  /**
   * Obtener clase CSS del borde según estado
   */
  getCardBorderClass(status: TripStatus): string {
    switch (status) {
      case TripStatus.COMPLETED:
        return 'border-success';
      case TripStatus.CANCELLED:
        return 'border-danger';
      default:
        return '';
    }
  }

  /**
   * Formatear fecha para mostrar
   */
  formatDate(date: Date | string | undefined): string {
    if (!date) return 'N/A';
    
    if (typeof date === 'string') {
      date = new Date(date);
    }
    
    return date.toLocaleDateString('es-EC', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Formatear tarifa con símbolo de moneda
   */
  formatFare(fare: number | undefined): string {
    if (!fare) return 'N/A';
    return `$${fare.toFixed(2)}`;
  }

  /**
   * Formatear distancia con unidades
   */
  formatDistance(distance: number | undefined): string {
    if (!distance) return 'N/A';
    return `${distance.toFixed(1)} km`;
  }

  /**
   * Truncar texto largo para mejor visualización
   */
  truncateText(text: string | undefined, maxLength: number = 50): string {
    if (!text) return 'N/A';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Obtener clase CSS para botones de filtro
   */
  getFilterButtonClass(filter: string): string {
    const baseClass = 'btn';
    
    if (this.selectedFilter === filter) {
      switch (filter) {
        case 'completed':
          return `${baseClass} btn-success`;
        case 'cancelled':
          return `${baseClass} btn-danger`;
        default:
          return `${baseClass} btn-primary`;
      }
    }
    
    return `${baseClass} btn-outline-secondary`;
  }

  /**
   * Verificar si hay viajes en el historial
   */
  hasTrips(): boolean {
    return this.trips.length > 0;
  }

  /**
   * Verificar si hay resultados filtrados
   */
  hasFilteredResults(): boolean {
    let totalFiltered = [...this.trips];
    
    if (this.selectedFilter === 'completed') {
      totalFiltered = totalFiltered.filter(trip => trip.status === TripStatus.COMPLETED);
    } else if (this.selectedFilter === 'cancelled') {
      totalFiltered = totalFiltered.filter(trip => trip.status === TripStatus.CANCELLED);
    }
    
    if (this.searchTerm.trim()) {
      totalFiltered = this.applySearch(totalFiltered, this.searchTerm);
    }
    
    return totalFiltered.length > 0;
  }

  /**
   * Obtener total de resultados filtrados
   */
  getTotalFilteredCount(): number {
    let totalFiltered = [...this.trips];
    
    if (this.selectedFilter === 'completed') {
      totalFiltered = totalFiltered.filter(trip => trip.status === TripStatus.COMPLETED);
    } else if (this.selectedFilter === 'cancelled') {
      totalFiltered = totalFiltered.filter(trip => trip.status === TripStatus.CANCELLED);
    }
    
    if (this.searchTerm.trim()) {
      totalFiltered = this.applySearch(totalFiltered, this.searchTerm);
    }
    
    return totalFiltered.length;
  }

  /**
   * Obtener icono de ordenamiento para columnas
   */
  getSortIcon(column: 'date' | 'fare' | 'distance'): string {
    if (this.sortBy !== column) return 'fas fa-sort text-muted';
    return this.sortOrder === 'asc' ? 'fas fa-sort-up text-primary' : 'fas fa-sort-down text-primary';
  }

  /**
   * Verificar si una columna está siendo ordenada
   */
  isColumnSorted(column: 'date' | 'fare' | 'distance'): boolean {
    return this.sortBy === column;
  }

  /**
   * Obtener mensaje personalizado para estado vacío
   */
  getEmptyStateMessage(): string {
    if (!this.hasTrips()) {
      return this.isPassenger 
        ? 'No has realizado ningún viaje aún. ¡Solicita tu primer viaje!'
        : 'No tienes viajes en tu historial aún.';
    }
    
    if (this.searchTerm.trim()) {
      return `No se encontraron viajes que coincidan con "${this.searchTerm}"`;
    }
    
    switch (this.selectedFilter) {
      case 'completed':
        return 'No tienes viajes completados.';
      case 'cancelled':
        return 'No tienes viajes cancelados.';
      default:
        return 'No hay viajes en tu historial.';
    }
  }

  /**
   * Calcular promedio de tarifa por viaje completado
   */
  getAverageFare(): number {
    if (this.completedTrips === 0) return 0;
    return this.totalFare / this.completedTrips;
  }

  /**
   * Calcular tasa de completación de viajes
   */
  getCompletionRate(): number {
    if (this.totalTrips === 0) return 0;
    return (this.completedTrips / this.totalTrips) * 100;
  }

  /**
   * TrackBy function para optimizar rendimiento en ngFor
   */
  trackByTripId(index: number, trip: Trip): number {
    return trip.id;
  }
}
