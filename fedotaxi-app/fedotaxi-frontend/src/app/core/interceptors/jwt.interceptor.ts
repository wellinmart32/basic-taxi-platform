import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';

@Injectable()
export class JwtInterceptor implements HttpInterceptor {

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    console.log(`🔄 ${request.method} ${new URL(request.url).pathname}`);
    
    // Obtener token del localStorage
    const token = localStorage.getItem('token');
    console.log(`🔑 Token: ${token ? 'presente' : 'ausente'}`);
    
    // Log del request body para debugging
    if (request.body) {
      console.log('📋 Request body:', request.body);
    }
    
    // Verificar si es URL de autenticación
    const isAuthUrl = this.isAuthUrl(request.url);
    console.log(`🔍 URL de auth: ${isAuthUrl}`);
    
    let finalRequest = request;
    
    // Agregar Authorization header si hay token y no es URL de auth
    if (token && !isAuthUrl) {
      console.log('✅ Agregando Authorization header');
      
      finalRequest = request.clone({
        setHeaders: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    } else {
      console.log(`⚠️ Sin Authorization header: ${!token ? 'no token' : 'URL de auth'}`);
    }
    
    console.log('🚀 Enviando request...');
    
    // Enviar request con manejo de respuesta
    return next.handle(finalRequest).pipe(
      tap(event => {
        if (event instanceof HttpResponse) {
          console.log(`✅ Response ${event.status}: ${event.url}`);
          
          // Log del body solo si es pequeño
          if (event.body) {
            const bodyStr = JSON.stringify(event.body);
            if (bodyStr.length < 500) {
              console.log('📄 Response body:', event.body);
            } else {
              console.log(`📄 Response body: [${bodyStr.length} chars]`);
            }
          }
        }
      }),
      catchError((error: HttpErrorResponse) => {
        console.error(`\n❌ HTTP Error ${error.status}: ${request.method} ${request.url}`);
        console.error(`📝 Message: ${error.message}`);
        
        // Log del request body que causó el error
        if (request.body) {
          console.error('📋 Request body:', JSON.stringify(request.body, null, 2));
        }
        
        // Log del error response
        if (error.error) {
          console.error('📄 Error response:', error.error);
        }
        
        // Análisis específico por código de error
        this.analyzeError(error, request);
        
        console.error('❌ End HTTP Error\n');
        
        return throwError(() => error);
      }),
      tap(() => {
        console.log('🔄 Request completed\n');
      })
    );
  }
  
  /**
   * Verificar si la URL es de autenticación
   */
  private isAuthUrl(url: string): boolean {
    const authUrls = ['/api/auth/login', '/api/auth/register'];
    return authUrls.some(authUrl => url.includes(authUrl));
  }

  /**
   * Analizar errores HTTP específicos
   */
  private analyzeError(error: HttpErrorResponse, request: HttpRequest<any>): void {
    switch (error.status) {
      case 400:
        console.error('🚫 Bad Request - Análisis:');
        this.analyzeBadRequest(error, request);
        break;
        
      case 401:
        console.error('🔐 Unauthorized - Token inválido o expirado');
        const token = localStorage.getItem('token');
        console.error(`Token actual: ${token ? token.substring(0, 30) + '...' : 'NO HAY TOKEN'}`);
        break;
        
      case 403:
        console.error('🚫 Forbidden - Permisos insuficientes');
        this.analyzeForbidden(request);
        break;
        
      case 404:
        console.error('🔍 Not Found - Endpoint no encontrado');
        console.error('Verificar URL del endpoint y implementación en backend');
        break;
        
      case 500:
        console.error('💥 Internal Server Error');
        console.error('Revisar logs del backend y base de datos');
        break;
        
      default:
        console.error(`❓ Error ${error.status}: Status no reconocido`);
    }
  }

  /**
   * Análisis específico para errores 400 Bad Request
   */
  private analyzeBadRequest(error: HttpErrorResponse, request: HttpRequest<any>): void {
    console.error(`URL: ${request.url}`);
    console.error(`Método: ${request.method}`);
    console.error('Error del servidor:', error.error);
    
    // Análisis específico para solicitud de viaje
    if (request.url.includes('/api/trips/request')) {
      console.error('🚖 ERROR EN SOLICITUD DE VIAJE:');
      this.analyzeTripRequestError(request.body);
    }
  }

  /**
   * Análisis específico para errores en solicitud de viaje
   */
  private analyzeTripRequestError(body: any): void {
    if (!body) return;
    
    console.error('Datos del viaje:');
    console.error(`  originAddress: ${body.originAddress}`);
    console.error(`  destinationAddress: ${body.destinationAddress}`);
    console.error(`  originLatitude: ${body.originLatitude} (${typeof body.originLatitude})`);
    console.error(`  originLongitude: ${body.originLongitude} (${typeof body.originLongitude})`);
    console.error(`  destinationLatitude: ${body.destinationLatitude} (${typeof body.destinationLatitude})`);
    console.error(`  destinationLongitude: ${body.destinationLongitude} (${typeof body.destinationLongitude})`);
    
    // Verificar campos faltantes
    const requiredFields = ['originAddress', 'destinationAddress', 'originLatitude', 'originLongitude', 'destinationLatitude', 'destinationLongitude'];
    const missingFields = requiredFields.filter(field => body[field] === undefined || body[field] === null);
    
    if (missingFields.length > 0) {
      console.error(`❌ CAMPOS FALTANTES: ${missingFields.join(', ')}`);
    }
    
    // Verificar coordenadas válidas
    this.validateCoordinates(body);
  }

  /**
   * Validar coordenadas en request de viaje
   */
  private validateCoordinates(body: any): void {
    // Validar rangos de coordenadas
    if (body.originLatitude < -90 || body.originLatitude > 90) {
      console.error(`❌ originLatitude inválida: ${body.originLatitude}`);
    }
    if (body.originLongitude < -180 || body.originLongitude > 180) {
      console.error(`❌ originLongitude inválida: ${body.originLongitude}`);
    }
    if (body.destinationLatitude < -90 || body.destinationLatitude > 90) {
      console.error(`❌ destinationLatitude inválida: ${body.destinationLatitude}`);
    }
    if (body.destinationLongitude < -180 || body.destinationLongitude > 180) {
      console.error(`❌ destinationLongitude inválida: ${body.destinationLongitude}`);
    }
    
    // Verificar coordenadas 0,0 (posiblemente inválidas)
    if (body.originLatitude === 0 && body.originLongitude === 0) {
      console.error('⚠️ Coordenadas de origen son 0,0 (puede ser inválido)');
    }
    if (body.destinationLatitude === 0 && body.destinationLongitude === 0) {
      console.error('⚠️ Coordenadas de destino son 0,0 (puede ser inválido)');
    }
  }

  /**
   * Análisis específico para errores 403 Forbidden
   */
  private analyzeForbidden(request: HttpRequest<any>): void {
    const userRole = localStorage.getItem('userRole');
    const userId = localStorage.getItem('userId');
    const token = localStorage.getItem('token');
    
    console.error(`URL solicitada: ${request.url}`);
    console.error(`Método: ${request.method}`);
    console.error(`User Role: ${userRole}`);
    console.error(`User ID: ${userId}`);
    console.error(`Token presente: ${!!token}`);
  }
}
