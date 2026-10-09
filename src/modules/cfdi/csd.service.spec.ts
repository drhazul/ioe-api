import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { descifrar } from './cripto';
import {
  CsdRepositorio,
  FilaCsd,
  GuardarFilaCsd,
  ResumenFilaCsd,
} from './csd.repositorio';
import { CsdService } from './csd.service';
import { generarCsdDePrueba } from './testing/csd-de-prueba';

const SECRETO = 'llave-de-cifrado-de-prueba';
const RFC = 'XIQB891116QE4';

/** Repositorio en memoria: las pruebas no tocan SQL Server. */
class RepoFalso {
  filas: GuardarFilaCsd[] = [];
  consultas = 0;

  guardar(fila: GuardarFilaCsd): Promise<void> {
    this.filas = this.filas.filter((f) => f.rfc !== fila.rfc);
    this.filas.push(fila);
    return Promise.resolve();
  }

  activoPorRfc(rfc: string): Promise<FilaCsd | null> {
    this.consultas += 1;
    const f = this.filas.find((x) => x.rfc.toUpperCase() === rfc);
    return Promise.resolve(
      f
        ? ({
            RFC: f.rfc,
            NOMBRE: f.nombre ?? null,
            NO_CERTIFICADO: f.noCertificado,
            REGIMEN_FISCAL: f.regimenFiscal,
            CODIGO_POSTAL: f.codigoPostal,
            CER: f.cer,
            LLAVE: f.llave,
            PASSWORD_CIFRADA: f.passwordCifrada,
            VIGENCIA_DESDE: f.vigenciaDesde,
            VIGENCIA_HASTA: f.vigenciaHasta,
          } as FilaCsd)
        : null,
    );
  }

  listar(): Promise<ResumenFilaCsd[]> {
    return Promise.resolve([]);
  }
}

function armar(opciones: { secreto?: string | undefined } = {}) {
  const repo = new RepoFalso();
  const config = {
    get: (k: string) =>
      k === 'CSD_CIFRADO_LLAVE'
        ? 'secreto' in opciones
          ? opciones.secreto
          : SECRETO
        : undefined,
  } as unknown as ConfigService;
  return {
    repo,
    service: new CsdService(repo as unknown as CsdRepositorio, config),
  };
}

function alta(generado = generarCsdDePrueba()) {
  return {
    cerBase64: generado.cer.toString('base64'),
    keyBase64: generado.key.toString('base64'),
    password: generado.password,
    regimenFiscal: '612',
    codigoPostal: '39000',
    usuario: 'sergio',
  };
}

describe('CsdService — alta', () => {
  it('toma el RFC del certificado y guarda la contrasena CIFRADA', async () => {
    const { service, repo } = armar();

    const r = await service.guardar(alta());

    expect(r.rfc).toBe(RFC);
    expect(r.noCertificado).toBe('30001000000500003364');
    expect(r.diasRestantes).toBeGreaterThan(0);

    const [fila] = repo.filas;
    expect(fila.rfc).toBe(RFC);
    // Lo que queda en la base no es la contrasena...
    expect(fila.passwordCifrada).not.toContain('contrasena-de-prueba');
    // ...pero con la llave del .env se recupera.
    expect(descifrar(fila.passwordCifrada, SECRETO)).toBe(
      'contrasena-de-prueba',
    );
  });

  it('rechaza la contrasena equivocada sin guardar nada', async () => {
    const { service, repo } = armar();

    await expect(
      service.guardar({ ...alta(), password: 'la-que-no-es' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.filas).toHaveLength(0);
  });

  it('rechaza un certificado vencido', async () => {
    const { service, repo } = armar();
    const vencido = generarCsdDePrueba({ diasDeVigencia: -1 });

    await expect(service.guardar(alta(vencido))).rejects.toThrow(/vencio/i);
    expect(repo.filas).toHaveLength(0);
  });

  it('rechaza un archivo vacio', async () => {
    const { service } = armar();
    await expect(service.guardar({ ...alta(), cerBase64: '' })).rejects.toThrow(
      /\.cer viene vacio/i,
    );
  });

  it('exige la llave de cifrado del .env', async () => {
    const { service } = armar({ secreto: undefined });
    await expect(service.guardar(alta())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('CsdService — uso al timbrar', () => {
  it('devuelve el CSD listo para sellar, con regimen y CP', async () => {
    const { service } = armar();
    await service.guardar(alta());

    const emisor = await service.obtenerPorRfc(RFC);

    expect(emisor.csd.rfc).toBe(RFC);
    expect(emisor.regimenFiscal).toBe('612');
    expect(emisor.codigoPostal).toBe('39000');
  });

  it('no vuelve a la base en cada factura, pero la recarga tras un alta', async () => {
    const { service, repo } = armar();
    await service.guardar(alta());

    await service.obtenerPorRfc(RFC);
    await service.obtenerPorRfc(RFC);
    expect(repo.consultas).toBe(1);

    // Renovar el certificado debe invalidar lo que trae en memoria.
    await service.guardar(alta());
    await service.obtenerPorRfc(RFC);
    expect(repo.consultas).toBe(2);
  });

  it('dice claramente cuando un RFC no tiene certificado cargado', async () => {
    const { service } = armar();

    await expect(service.obtenerPorRfc('AAA010101AAA')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.obtenerPorRfc('AAA010101AAA')).rejects.toThrow(
      /Cargalo en \/cfdi\/csd/,
    );
  });

  it('avisa si la llave de cifrado ya no corresponde', async () => {
    const { service, repo } = armar();
    await service.guardar(alta());

    // Mismo repositorio, otra llave en el .env: no debe abrir el certificado.
    const otro = new CsdService(
      repo as unknown as CsdRepositorio,
      {
        get: () => 'llave-distinta',
      } as unknown as ConfigService,
    );

    await expect(otro.obtenerPorRfc(RFC)).rejects.toThrow(
      /no se pudo descifrar/i,
    );
  });
});
