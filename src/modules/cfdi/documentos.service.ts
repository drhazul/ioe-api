import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CfdiImpreso, leerCfdiTimbrado } from './cfdi-lector';
import { RepresentacionImpresaService } from './representacion-impresa.service';
import { columna } from './venta.mapper';
import { VentaRepositorio } from './venta.repositorio';

export interface DocumentoCfdi {
  nombre: string;
  contenido: Buffer;
  tipo: string;
}

/**
 * Entrega el XML y el PDF de un folio ya timbrado.
 *
 * El XML es el que se guardo al timbrar: ese es el documento fiscal y no se
 * vuelve a generar nunca, porque el sello solo vale sobre ese archivo exacto.
 *
 * El PDF, en cambio, es solo la representacion impresa. Lo genera el PAC a
 * partir del UUID, asi que se puede pedir las veces que haga falta. Se guarda
 * en disco la primera vez para no estar molestando a Quadrum en cada descarga.
 */
@Injectable()
export class DocumentosService {
  private readonly logger = new Logger(DocumentosService.name);

  constructor(
    private readonly repo: VentaRepositorio,
    private readonly impresa: RepresentacionImpresaService,
    private readonly config: ConfigService,
  ) {}

  async xml(idFol: string): Promise<DocumentoCfdi> {
    const datos = await this.datosDelFolio(idFol);

    if (!datos.xmlPath) {
      throw new NotFoundException(
        `El folio ${idFol} no tiene XML guardado. Si lo timbro otro sistema, ` +
          `el archivo vive de ese lado.`,
      );
    }
    if (!existsSync(datos.xmlPath)) {
      throw new NotFoundException(
        `El XML del folio ${idFol} esta registrado en ${datos.xmlPath}, pero el ` +
          `archivo ya no esta ahi.`,
      );
    }

    return {
      nombre: `${datos.base}.xml`,
      contenido: readFileSync(datos.xmlPath),
      tipo: 'application/xml',
    };
  }

  async pdf(idFol: string): Promise<DocumentoCfdi> {
    const datos = await this.datosDelFolio(idFol);

    // Si ya se habia descargado antes, se reusa.
    if (datos.pdfPath && existsSync(datos.pdfPath)) {
      return {
        nombre: `${datos.base}.pdf`,
        contenido: readFileSync(datos.pdfPath),
        tipo: 'application/pdf',
      };
    }

    // El PDF se dibuja a partir del XML timbrado: es el unico documento
    // que tiene todos los datos, incluidos los sellos y el timbre.
    const xml = await this.xml(idFol);
    const contenido = await this.impresa.generar(
      xml.contenido.toString('utf8'),
    );
    const destino = this.rutaPdf(datos);
    try {
      mkdirSync(dirname(destino), { recursive: true });
      writeFileSync(destino, contenido);
      await this.repo.marcarPdf({ idFol, pdfPath: destino });
    } catch (e) {
      // Que no se pueda guardar no debe impedir la descarga.
      const detalle = e instanceof Error ? e.message : String(e);
      this.logger.warn(`No se pudo guardar el PDF de ${idFol}: ${detalle}`);
    }

    return {
      nombre: `${datos.base}.pdf`,
      contenido,
      tipo: 'application/pdf',
    };
  }

  /**
   * Acuse de cancelacion: el XML que firma el SAT al aceptar la solicitud.
   *
   * Se sirve el que se guardo al cancelar. No se pide de nuevo al PAC a
   * proposito: el archivo en disco es el que quedo como evidencia, y es el
   * que hay que conservar.
   */
  async acuseCancelacion(idFol: string): Promise<DocumentoCfdi> {
    const datos = await this.datosDelFolio(idFol);
    const archivo = this.buscarAcuse(datos.uuid);

    if (!archivo) {
      throw new NotFoundException(
        `No hay acuse de cancelacion guardado para el folio ${idFol}. ` +
          `Si nunca se cancelo, no existe; si se cancelo con otro sistema, ` +
          `el acuse vive de ese lado.`,
      );
    }

    return {
      nombre: `${datos.base}_acuse-cancelacion.xml`,
      contenido: readFileSync(archivo),
      tipo: 'application/xml',
    };
  }

  /**
   * La carpeta de evidencia lleva el UUID en el nombre; si se cancelo mas
   * de una vez, gana la mas reciente.
   */
  private buscarAcuse(uuid: string): string | null {
    const raiz = join(
      resolve(
        this.config.get<string>('CFDI_EVIDENCIA_DIR') || 'cfdi-timbrados',
      ),
      'cancelaciones',
    );
    if (!existsSync(raiz)) return null;

    const candidatas = readdirSync(raiz)
      .filter((nombre) => nombre.includes(uuid))
      .sort()
      .reverse();

    for (const carpeta of candidatas) {
      const archivo = join(raiz, carpeta, 'acuse-sat.xml');
      if (existsSync(archivo)) return archivo;
    }
    return null;
  }

  /** XML timbrado de una nota de credito. */
  async xmlNota(idFol: string, uuid: string): Promise<DocumentoCfdi> {
    const archivo = await this.archivoDeNota(idFol, uuid);
    return {
      nombre: this.nombreDeArchivo(archivo),
      contenido: readFileSync(archivo),
      tipo: 'application/xml',
    };
  }

  /**
   * Representacion impresa de una nota de credito.
   *
   * Sale del mismo generador que las facturas: el XML trae el tipo de
   * comprobante, asi que se rotula sola como nota de credito.
   */
  async pdfNota(idFol: string, uuid: string): Promise<DocumentoCfdi> {
    const archivo = await this.archivoDeNota(idFol, uuid);
    const destino = archivo.replace(/.xml$/i, '.pdf');

    if (existsSync(destino)) {
      return {
        nombre: this.nombreDeArchivo(destino, '.pdf'),
        contenido: readFileSync(destino),
        tipo: 'application/pdf',
      };
    }

    const contenido = await this.impresa.generar(readFileSync(archivo, 'utf8'));
    try {
      writeFileSync(destino, contenido);
    } catch (e) {
      const detalle = e instanceof Error ? e.message : String(e);
      this.logger.warn(`No se pudo guardar el PDF de la nota: ${detalle}`);
    }
    return {
      nombre: this.nombreDeArchivo(destino, '.pdf'),
      tipo: 'application/pdf',
      contenido,
    };
  }

  /** Ubica el XML de la nota por su UUID, dentro del almacen de ese RFC. */
  private async archivoDeNota(idFol: string, uuid: string): Promise<string> {
    const datos = await this.datosDelFolio(idFol);
    const archivo = this.buscarPorUuid(datos.rfcEmisor, uuid);
    if (!archivo) {
      throw new NotFoundException(
        `No hay XML guardado de la nota de credito ${uuid} del folio ${idFol}.`,
      );
    }
    return archivo;
  }

  private buscarPorUuid(rfcEmisor: string, uuid: string): string | null {
    const raiz = join(this.raizAlmacen(), rfcEmisor);
    if (!existsSync(raiz)) return null;
    const sufijo = `_${uuid}.xml`.toUpperCase();

    for (const anio of readdirSync(raiz)) {
      const carpetaAnio = join(raiz, anio);
      if (!existsSync(carpetaAnio)) continue;
      for (const mes of readdirSync(carpetaAnio)) {
        const carpetaMes = join(carpetaAnio, mes);
        if (!existsSync(carpetaMes)) continue;
        const encontrado = readdirSync(carpetaMes).find((n) =>
          n.toUpperCase().endsWith(sufijo),
        );
        if (encontrado) return join(carpetaMes, encontrado);
      }
    }
    return null;
  }

  private nombreDeArchivo(ruta: string, extension?: string): string {
    const base = ruta.split(/[\\/]/).pop() ?? 'nota-credito.xml';
    if (!extension) return base;
    return base.replace(/\.[^.]+$/, extension);
  }

  /** El CFDI de la factura, ya leido. Null si el folio no esta timbrado. */
  async cfdiDelFolio(idFol: string): Promise<CfdiImpreso | null> {
    try {
      const xml = await this.xml(idFol);
      return leerCfdiTimbrado(xml.contenido.toString('utf8'));
    } catch {
      return null;
    }
  }

  /**
   * El CFDI de una nota de credito ya emitida.
   *
   * Se busca por su nomenclatura y UUID en la carpeta del RFC, que es como
   * quedan guardadas. Si el archivo no esta, devuelve null en vez de fallar:
   * el conteo de lo ya devuelto no debe tumbar la pantalla.
   */
  async cfdiDeNota(
    idFol: string,
    nota: { nomenclatura: string; uuid: string | null },
  ): Promise<CfdiImpreso | null> {
    if (!nota.uuid) return null;
    const datos = await this.datosDelFolio(idFol).catch(() => null);
    if (!datos) return null;

    const archivo = this.rutaDeNota(
      datos.rfcEmisor,
      nota.nomenclatura,
      nota.uuid,
    );
    if (!archivo || !existsSync(archivo)) return null;
    try {
      return leerCfdiTimbrado(readFileSync(archivo, 'utf8'));
    } catch {
      return null;
    }
  }

  /** Guarda el XML de una nota junto a las facturas de ese RFC. */
  guardarXmlDeNota(input: {
    rfcEmisor: string;
    serie: string;
    folio: string;
    uuid: string;
    xml?: string;
  }): string {
    const destino = this.rutaNueva(
      input.rfcEmisor,
      `${input.serie}-${input.folio}_${input.uuid}.xml`,
    );
    mkdirSync(dirname(destino), { recursive: true });
    if (input.xml) writeFileSync(destino, Buffer.from(input.xml, 'utf8'));
    return destino;
  }

  /** Busca el XML de una nota en las carpetas por anio y mes de ese RFC. */
  private rutaDeNota(
    rfcEmisor: string,
    nomenclatura: string,
    uuid: string,
  ): string | null {
    const raiz = join(this.raizAlmacen(), rfcEmisor);
    if (!existsSync(raiz)) return null;
    const nombre = `${nomenclatura}_${uuid}.xml`;

    for (const anio of readdirSync(raiz)) {
      const carpetaAnio = join(raiz, anio);
      if (!existsSync(carpetaAnio)) continue;
      for (const mes of readdirSync(carpetaAnio)) {
        const archivo = join(carpetaAnio, mes, nombre);
        if (existsSync(archivo)) return archivo;
      }
    }
    return null;
  }

  private rutaNueva(rfcEmisor: string, nombre: string): string {
    const ahora = new Date();
    return join(
      this.raizAlmacen(),
      rfcEmisor,
      String(ahora.getFullYear()),
      String(ahora.getMonth() + 1).padStart(2, '0'),
      nombre,
    );
  }

  private raizAlmacen(): string {
    return resolve(
      this.config.get<string>('CFDI_STORAGE_BASE_PATH') || 'cfdi-timbrados',
    );
  }

  // ---------------------------------------------------------------------

  private async datosDelFolio(idFol: string) {
    const filas = await this.repo.folio(idFol);
    const header = filas.header;

    const uuid = columna(header, 'CFDI_UUID');
    if (!uuid) {
      throw new BadRequestException(
        `El folio ${idFol} no esta timbrado: no hay XML ni PDF que entregar.`,
      );
    }

    const rfcEmisor = (
      columna(header, 'RfcEmisor') || columna(filas.sucursal, 'RFC')
    ).toUpperCase();

    const xmlPath = columna(header, 'CFDI_XML_PATH');
    const pdfPath = columna(header, 'CFDI_PDF_PATH');

    return {
      idFol,
      uuid,
      rfcEmisor,
      xmlPath,
      pdfPath,
      // Nombre de archivo util para quien lo descarga.
      base: `${idFol}_${uuid}`,
    };
  }

  /** El PDF se guarda junto al XML; si no hay XML, en la carpeta del RFC. */
  private rutaPdf(datos: {
    xmlPath: string;
    rfcEmisor: string;
    base: string;
  }): string {
    if (datos.xmlPath) {
      return datos.xmlPath.replace(/\.xml$/i, '.pdf');
    }
    const base = resolve(
      this.config.get<string>('CFDI_STORAGE_BASE_PATH') || 'cfdi-timbrados',
    );
    const ahora = new Date();
    return join(
      base,
      datos.rfcEmisor,
      String(ahora.getFullYear()),
      String(ahora.getMonth() + 1).padStart(2, '0'),
      `${datos.base}.pdf`,
    );
  }
}
