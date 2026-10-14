import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { cifrar, descifrar } from '../cripto';
import { DocumentosService } from '../documentos.service';
import { VentaRepositorio } from '../venta.repositorio';
import { columna } from '../venta.mapper';
import {
  CfdiCorreoRepositorio,
  TrabajoCorreo,
} from './cfdi-correo.repositorio';
import { ActualizarCorreoConfigDto } from './dto/actualizar-correo-config.dto';
import { ProbarCorreoDto } from './dto/probar-correo.dto';
import { ErrorEntregaCorreo } from './gmail.provider';
import { GoogleOAuthService } from './google-oauth.service';
import { CFDI_CORREO_PROVIDER } from './proveedor-correo';
import type { ProveedorCorreo } from './proveedor-correo';

@Injectable()
export class CfdiCorreoService {
  private readonly logger = new Logger(CfdiCorreoService.name);

  constructor(
    private readonly repo: CfdiCorreoRepositorio,
    private readonly ventaRepo: VentaRepositorio,
    private readonly documentos: DocumentosService,
    @Inject(CFDI_CORREO_PROVIDER)
    private readonly proveedorCorreo: ProveedorCorreo,
    private readonly oauth: GoogleOAuthService,
    private readonly config: ConfigService,
  ) {}

  async configuracion() {
    const config = await this.repo.configuracion();
    if (!config) {
      throw new ServiceUnavailableException(
        'Falta instalar la configuración de correo de FACTURA_QUADRUM.',
      );
    }
    return {
      proveedor: 'GMAIL',
      automatico: Boolean(config.AUTOMATICO),
      nombreRemitente: config.NOMBRE_REMITENTE,
      cuentaConectada: config.CUENTA_GOOGLE,
      conectado: Boolean(
        config.CUENTA_GOOGLE && config.REFRESH_TOKEN_CIFRADO,
      ),
      modoPruebas:
        String(
          this.config.get<string>('GOOGLE_OAUTH_PUBLISHING_STATUS') ??
            'TESTING',
        ).toUpperCase() !== 'PRODUCTION',
    };
  }

  async guardarConfiguracion(dto: ActualizarCorreoConfigDto) {
    const nombreRemitente = dto.nombreRemitente.trim();
    if (!nombreRemitente) {
      throw new BadRequestException('El nombre del remitente es obligatorio.');
    }
    const config = await this.repo.configuracion();
    if (!config) {
      throw new ServiceUnavailableException(
        'Falta instalar la configuración de correo de FACTURA_QUADRUM.',
      );
    }
    if (dto.automatico && !config.REFRESH_TOKEN_CIFRADO) {
      throw new BadRequestException(
        'Conecta la cuenta Gmail antes de activar el envío automático.',
      );
    }
    await this.repo.actualizarConfiguracion({
      automatico: dto.automatico,
      nombreRemitente,
    });
    return this.configuracion();
  }

  iniciarOAuth() {
    return this.oauth.iniciar();
  }

  async probar(dto: ProbarCorreoDto) {
    const config = await this.repo.configuracion();
    if (!config?.CUENTA_GOOGLE || !config.REFRESH_TOKEN_CIFRADO) {
      throw new BadRequestException('Conecta primero la cuenta Gmail.');
    }
    const destinatario = this.normalizarEmail(dto.destinatario);
    if (!destinatario) {
      throw new BadRequestException('Escribe un correo destinatario válido.');
    }
    await this.proveedorCorreo.enviar({
      para: destinatario,
      desde: config.CUENTA_GOOGLE,
      nombreRemitente: config.NOMBRE_REMITENTE,
      asunto: 'Prueba de correo · FACTURA_QUADRUM',
      texto:
        'Mensaje de prueba solicitado desde FACTURA_QUADRUM. ' +
        'No contiene documentos fiscales.',
    });
    return { enviado: true, mensaje: 'Gmail aceptó el mensaje de prueba.' };
  }

  async envios(limit = 50) {
    const filas = await this.repo.listar(limit);
    return filas.map((fila) => this.resumen(fila));
  }

  async reintentar(id: number) {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException('Identificador de envío inválido.');
    }
    const trabajo = await this.repo.porId(id);
    if (!trabajo) throw new NotFoundException('No existe el envío.');
    if (
      !['REINTENTABLE', 'ERROR_FINAL', 'OMITIDO_SIN_DESTINATARIO'].includes(
        trabajo.ESTADO,
      )
    ) {
      throw new BadRequestException(
        'Este envío no se puede reintentar desde su estado actual.',
      );
    }

    const config = await this.repo.configuracion();
    if (!config?.AUTOMATICO || !config.REFRESH_TOKEN_CIFRADO) {
      throw new BadRequestException(
        'Activa el envío automático y conecta Gmail antes de reintentar.',
      );
    }
    const folio = await this.ventaRepo.folio(trabajo.IDFOL);
    const header = folio.header;
    if (
      columna(header, 'CFDI_PAC').toUpperCase() !== 'QUADRUM' ||
      columna(header, 'CFDI_STATUS').toUpperCase() !== 'TIMBRADO' ||
      columna(header, 'CFDI_UUID') !== trabajo.CFDI_UUID ||
      columna(header, 'CFDI_CANCEL_STATUS')
    ) {
      throw new BadRequestException(
        'El CFDI ya no está vigente como factura timbrada por Quadrum.',
      );
    }
    if (folio.clienteCorreoAmbiguo) {
      throw new BadRequestException(
        'El RFC coincide con registros que tienen correos distintos. Corrige la ficha del cliente y reintenta.',
      );
    }
    const destinatario = this.normalizarEmail(
      columna(folio.cliente, 'EMAILRECEPTOR'),
    );
    if (!destinatario) {
      throw new BadRequestException(
        'El cliente aún no tiene un correo válido en EMAILRECEPTOR.',
      );
    }
    const actualizado = await this.repo.reintentar({
      id,
      destinatarioCifrado: this.cifrarEmail(destinatario),
    });
    if (!actualizado) {
      throw new BadRequestException(
        'El estado del envío cambió; actualiza la lista e intenta otra vez.',
      );
    }
    return { encolado: true };
  }

  async encolarEmision(input: {
    idFol: string;
    uuid: string;
    emailCliente: string;
    emailAmbiguo?: boolean;
  }): Promise<void> {
    const config = await this.repo.configuracion();
    if (!config) {
      throw new ServiceUnavailableException(
        'Falta instalar la tabla de configuración de correo.',
      );
    }
    const email = input.emailAmbiguo
      ? ''
      : this.normalizarEmail(input.emailCliente);
    await this.repo.insertarTrabajo({
      idFol: input.idFol,
      uuid: input.uuid,
      destinatarioCifrado:
        email && config.AUTOMATICO ? this.cifrarEmail(email) : null,
      tieneDestinatario: Boolean(email),
      automatico: Boolean(config.AUTOMATICO),
      motivoOmitido: input.emailAmbiguo
        ? 'El RFC coincide con registros que tienen correos distintos; se omitió el envío automático.'
        : input.emailCliente && !email
          ? 'El correo registrado del cliente no tiene formato válido.'
          : undefined,
    });
  }

  async reconciliar(): Promise<void> {
    const config = await this.repo.configuracion();
    const desde = config?.AUTO_ENABLED_AT;
    if (!config?.AUTOMATICO || !desde) return;

    const candidatos = await this.repo.candidatosSinTrabajo(desde, 50);
    for (const candidato of candidatos) {
      try {
        const folio = await this.ventaRepo.folio(candidato.IDFOL);
        if (
          columna(folio.header, 'CFDI_PAC').toUpperCase() !== 'QUADRUM' ||
          columna(folio.header, 'CFDI_STATUS').toUpperCase() !== 'TIMBRADO' ||
          columna(folio.header, 'CFDI_UUID') !== candidato.CFDI_UUID ||
          columna(folio.header, 'CFDI_CANCEL_STATUS')
        ) {
          continue;
        }
        await this.encolarEmision({
          idFol: candidato.IDFOL,
          uuid: candidato.CFDI_UUID,
          emailCliente: columna(folio.cliente, 'EMAILRECEPTOR'),
          emailAmbiguo: folio.clienteCorreoAmbiguo,
        });
      } catch {
        this.logger.warn(
          'No se pudo reconciliar un envío automático de CFDI Quadrum.',
        );
      }
    }
  }

  async procesarPendientes(): Promise<void> {
    const config = await this.repo.configuracion();
    if (!config?.AUTOMATICO || !config.CUENTA_GOOGLE) return;

    await this.repo.marcarProcesandoInciertoAntiguo();
    for (let i = 0; i < 5; i += 1) {
      const trabajo = await this.repo.trabajoSiguiente();
      if (!trabajo) return;
      await this.procesarTrabajo(trabajo, config.CUENTA_GOOGLE, config.NOMBRE_REMITENTE);
    }
  }

  private async procesarTrabajo(
    trabajo: TrabajoCorreo,
    cuenta: string,
    nombreRemitente: string,
  ): Promise<void> {
    const intento = { intentoId: randomUUID(), outboxId: trabajo.ID,
      host: hostname(), pid: process.pid, intento: trabajo.INTENTOS };
    this.logger.log(JSON.stringify({ ...intento, etapa: 'INICIO' }));
    const destinatario = this.descifrarEmail(
      trabajo.DESTINATARIO_CIFRADO,
    );
    if (!destinatario) {
      await this.repo.marcarFallo({
        id: trabajo.ID,
        estado: 'ERROR_FINAL',
        codigo: 'DESTINATARIO_INVALIDO',
        mensaje: 'El envío no tiene destinatario válido.',
        intentos: trabajo.INTENTOS,
      });
      return;
    }

    let messageId: string;
    let etapa = 'XML';
    try {
      const xml = await this.documentos.xml(trabajo.IDFOL);
      etapa = 'PDF';
      const pdf = await this.documentos.pdf(trabajo.IDFOL);
      etapa = 'ENVIO';
      const idSeguro = trabajo.IDFOL.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
      const uuidSeguro = trabajo.CFDI_UUID.replace(/[^A-Fa-f0-9-]/g, '');
      messageId = await this.proveedorCorreo.enviar({
        para: destinatario,
        desde: cuenta,
        nombreRemitente,
        asunto: 'CFDI ' + trabajo.IDFOL,
        texto:
          'Adjuntamos XML y representación PDF de la factura ' +
          trabajo.IDFOL +
          '. UUID: ' +
          trabajo.CFDI_UUID +
          '.',
        adjuntos: [
          {
            nombre: idSeguro + '_' + uuidSeguro + '.xml',
            tipo: 'application/xml',
            contenido: xml.contenido,
          },
          {
            nombre: idSeguro + '_' + uuidSeguro + '.pdf',
            tipo: 'application/pdf',
            contenido: pdf.contenido,
          },
        ],
      });
    } catch (error) {
      const fallo =
        error instanceof ErrorEntregaCorreo
          ? error
          : new ErrorEntregaCorreo(
              'Falló la etapa ' + etapa + ' del envío de CFDI.',
              'ERROR_PROCESAMIENTO_' + etapa,
              etapa === 'ENVIO' ? 'INCIERTO' : 'REINTENTABLE',
            );
      await this.repo.marcarFallo({
        id: trabajo.ID,
        estado: fallo.tipo,
        codigo: fallo.codigo,
        mensaje: fallo.message,
        intentos: trabajo.INTENTOS,
      });
      this.logger.warn(
        JSON.stringify({ ...intento, etapa, codigo: fallo.codigo, estado: fallo.tipo }),
      );
      return;
    }

    try {
      await this.repo.marcarEnviado({ id: trabajo.ID, messageId });
      this.logger.log(JSON.stringify({ ...intento, etapa: 'PERSISTENCIA', estado: 'ENVIADO' }));
    } catch {
      // Gmail ya aceptó el mensaje: conservar PROCESANDO para revisión como
      // INCIERTO y no programar un reenvío que podría duplicar el correo.
      this.logger.error(
        'Gmail aceptó el correo de ' +
          trabajo.IDFOL +
          ', pero no se pudo persistir el resultado; requiere revisión.',
      );
    }
  }

  private resumen(fila: TrabajoCorreo) {
    return {
      id: fila.ID,
      idFol: fila.IDFOL,
      uuid: fila.CFDI_UUID,
      destinatario: this.enmascarar(
        this.descifrarEmail(fila.DESTINATARIO_CIFRADO),
      ),
      estado: fila.ESTADO,
      intentos: fila.INTENTOS,
      codigo: fila.ULTIMO_CODIGO,
      mensaje: fila.ULTIMO_MENSAJE,
      creadoEn: fila.CREADO_EN,
      actualizadoEn: fila.ACTUALIZADO_EN,
      enviadoEn: fila.ENVIADO_EN,
    };
  }

  private normalizarEmail(value: string): string | null {
    const email = String(value ?? '').trim().toLowerCase();
    return email.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      !/[\r\n;,]/.test(email)
      ? email
      : null;
  }

  private cifrarEmail(email: string): string {
    const llave = this.config.get<string>('CFDI_EMAIL_TOKEN_ENCRYPTION_KEY');
    if (!llave) {
      throw new ServiceUnavailableException(
        'Falta CFDI_EMAIL_TOKEN_ENCRYPTION_KEY en el entorno de la API.',
      );
    }
    return cifrar(email, llave);
  }

  private descifrarEmail(value: string | null): string | null {
    if (!value) return null;
    const llave = this.config.get<string>('CFDI_EMAIL_TOKEN_ENCRYPTION_KEY');
    if (!llave) return null;
    try {
      return this.normalizarEmail(descifrar(value, llave));
    } catch {
      return null;
    }
  }

  private enmascarar(value: string | null): string | null {
    if (!value) return null;
    const [usuario, dominio] = value.split('@');
    if (!usuario || !dominio) return '***';
    return usuario.slice(0, 1) + '***@' + dominio;
  }
}
