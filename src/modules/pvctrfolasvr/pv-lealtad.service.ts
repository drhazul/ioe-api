import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';

type RewardsLoginResponse = {
  token?: unknown;
};

type RewardsParticipationResponse = {
  ok?: unknown;
  idc?: unknown;
  participante?: unknown;
};

@Injectable()
export class PvLealtadService {
  private accessToken: { value: string; expiresAt: number } | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async consultarParticipacion(idfolRaw: string, user: JwtPayload) {
    const idfol = String(idfolRaw ?? '').trim();
    if (!idfol) throw new BadRequestException('IDFOL es requerido');

    const folios = (await this.dataSource.query(
      `
      SELECT TOP 1 IDFOL, CLIEN, SUC
      FROM dbo.PV_CTR_FOL_ASVR
      WHERE IDFOL = @0 OR IDFOLINICIAL = @0
      ORDER BY CASE WHEN IDFOL = @0 THEN 0 ELSE 1 END, FCN DESC, FCNM DESC
      `,
      [idfol],
    )) as Record<string, unknown>[];
    const folio = folios?.[0];
    if (!folio) throw new NotFoundException(`La cotizacion ${idfol} no existe`);

    const idfolActual = String(folio.IDFOL ?? '').trim();
    const suc = String(folio.SUC ?? '').trim();
    if (!idfolActual || !suc) {
      throw new BadRequestException('La cotizacion no tiene contexto completo');
    }
    this.assertSucursal(user, suc);

    const clienteId = Number(folio.CLIEN);
    if (!Number.isSafeInteger(clienteId) || clienteId <= 0) {
      throw new BadRequestException(
        'La cotizacion no tiene un IDC entero valido para consultar recompensas',
      );
    }

    const clientes = (await this.dataSource.query(
      `
      SELECT TOP 1 IDC
      FROM dbo.FACT_CLIENT_SHP
      WHERE IDC = @0
        AND UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = UPPER(@1)
      `,
      [clienteId, suc],
    )) as Record<string, unknown>[];
    if (!clientes?.length) {
      throw new NotFoundException(
        'El cliente del folio no corresponde a la sucursal de la cotizacion',
      );
    }

    const participante = await this.consultarEnRecompensas(clienteId);
    return {
      ok: true,
      idfol: idfolActual,
      clienteId: String(clienteId),
      participante,
    };
  }

  private async consultarEnRecompensas(clienteId: number): Promise<boolean> {
    const baseUrl = this.getBaseUrl();
    let token = await this.obtenerToken(baseUrl);
    let result = await this.requestJson<RewardsParticipationResponse>(
      `${baseUrl}/api/mercader/fidelidad/cliente/${clienteId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (result.response.status === 401) {
      this.accessToken = null;
      token = await this.obtenerToken(baseUrl);
      result = await this.requestJson<RewardsParticipationResponse>(
        `${baseUrl}/api/mercader/fidelidad/cliente/${clienteId}`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
    }

    if (!result.response.ok) {
      throw new ServiceUnavailableException({
        code:
          result.response.status === 401 || result.response.status === 403
            ? 'LEALTAD_PERMISO_DENEGADO'
            : 'LEALTAD_CONSULTA_NO_DISPONIBLE',
        message:
          'El servicio de lealtad no pudo consultar la participación del cliente',
      });
    }
    if (
      result.body.ok !== true ||
      typeof result.body.participante !== 'boolean'
    ) {
      throw new BadGatewayException({
        code: 'LEALTAD_RESPUESTA_INVALIDA',
        message: 'El servicio de lealtad devolvió una respuesta incompatible',
      });
    }
    if (result.body.participante) {
      const respuestaIdc = Number(result.body.idc);
      if (!Number.isSafeInteger(respuestaIdc) || respuestaIdc !== clienteId) {
        throw new BadGatewayException({
          code: 'LEALTAD_CLIENTE_INCONSISTENTE',
          message: 'El servicio de lealtad devolvió otro cliente',
        });
      }
    }

    return result.body.participante;
  }

  private async obtenerToken(baseUrl: string): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 30_000) {
      return this.accessToken.value;
    }

    if (this.tokenRequest) return this.tokenRequest;

    const pending = this.iniciarSesion(baseUrl);
    this.tokenRequest = pending;
    try {
      return await pending;
    } finally {
      if (this.tokenRequest === pending) this.tokenRequest = null;
    }
  }

  private async iniciarSesion(baseUrl: string): Promise<string> {
    const username =
      this.config.get<string>('RECOMPENSAS_API_USERNAME')?.trim() ||
      this.config.get<string>('USER_API_FEDERADA')?.trim();
    const password =
      this.config.get<string>('RECOMPENSAS_API_PASSWORD') ||
      this.config.get<string>('PASSWORD_API_FEDERADA');
    if (!username || !password) {
      throw new ServiceUnavailableException({
        code: 'LEALTAD_CUENTA_NO_CONFIGURADA',
        message:
          'La cuenta de conexión al servicio de lealtad no está configurada',
      });
    }

    const { response, body } = await this.requestJson<RewardsLoginResponse>(
      `${baseUrl}/api/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': 'android',
        },
        body: JSON.stringify({ nombreUsuario: username, password }),
      },
    );
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!response.ok || !token) {
      throw new ServiceUnavailableException({
        code:
          response.status === 401 || response.status === 403
            ? 'LEALTAD_AUTH_RECHAZADA'
            : 'LEALTAD_AUTH_NO_DISPONIBLE',
        message: 'No fue posible autenticar la conexión al servicio de lealtad',
      });
    }

    this.accessToken = {
      value: token,
      // El login actual de recompensas emite JWT de ocho horas.
      expiresAt: Date.now() + 7 * 60 * 60 * 1000,
    };
    return token;
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit,
  ): Promise<{ response: Response; body: T }> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw new ServiceUnavailableException({
        code:
          error instanceof Error &&
          ['TimeoutError', 'AbortError'].includes(error.name)
            ? 'LEALTAD_TIMEOUT'
            : 'LEALTAD_CONEXION_NO_DISPONIBLE',
        message: 'No fue posible conectar con el servicio de lealtad',
      });
    }

    let body: T;
    try {
      body = (await response.json()) as T;
    } catch {
      throw new BadGatewayException({
        code: 'LEALTAD_RESPUESTA_INVALIDA',
        message: 'El servicio de lealtad devolvió contenido no válido',
      });
    }
    return { response, body };
  }

  private getBaseUrl(): string {
    const raw = this.config.get<string>('RECOMPENSAS_API_URL')?.trim();
    if (!raw) {
      throw new ServiceUnavailableException({
        code: 'LEALTAD_URL_NO_CONFIGURADA',
        message: 'La conexión al servicio de lealtad no está configurada',
      });
    }

    try {
      const url = new URL(raw);
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error('Protocolo no permitido');
      }
      // Admitir la URL base o su sufijo /api sin construir /api/api.
      return url
        .toString()
        .replace(/\/+$/, '')
        .replace(/\/api$/i, '');
    } catch {
      throw new ServiceUnavailableException({
        code: 'LEALTAD_URL_INVALIDA',
        message: 'La conexión al servicio de lealtad tiene una URL inválida',
      });
    }
  }

  private assertSucursal(user: JwtPayload, suc: string): void {
    if (Number(user?.roleId ?? 0) === 1) return;

    const userSuc = String(user?.suc ?? '').trim();
    if (!userSuc || userSuc === '000') return;
    if (userSuc !== suc) {
      throw new ForbiddenException(
        `No autorizado para consultar recompensas de la sucursal ${suc}`,
      );
    }
  }
}
