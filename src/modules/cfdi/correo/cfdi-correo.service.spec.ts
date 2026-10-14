import { ConfigService } from '@nestjs/config';
import { CfdiCorreoService } from './cfdi-correo.service';
import { CfdiCorreoRepositorio } from './cfdi-correo.repositorio';
import { VentaRepositorio } from '../venta.repositorio';
import { DocumentosService } from '../documentos.service';
import { GoogleOAuthService } from './google-oauth.service';
import { cifrar } from '../cripto';

describe('Existing CFDI email retry', () => {
  it('normalizes SQL BIGINT strings in the public response and rejects overflow', () => {
    const f = fixture();
    expect((f.service as any).resumen({ ...f.trabajo, ID: '3' }).id).toBe(3);
    expect(() => (f.service as any).resumen({ ...f.trabajo, ID: '9007199254740992' })).toThrow();
  });
  const key = 'offline-test-encryption-key-not-production';
  function fixture(estado = 'ERROR_FINAL') {
    const trabajo = { ID: 1, IDFOL: 'TEST-FOLIO', CFDI_UUID: 'TEST-UUID',
      ESTADO: estado, INTENTOS: 1, DESTINATARIO_CIFRADO: cifrar('customer@example.test', key) };
    const repo = { porId: jest.fn().mockResolvedValue(trabajo),
      configuracion: jest.fn().mockResolvedValue({ AUTOMATICO: true, CUENTA_GOOGLE: 'sender@example.test',
        REFRESH_TOKEN_CIFRADO: 'offline', NOMBRE_REMITENTE: 'IOE' }),
      reintentar: jest.fn().mockResolvedValue(true), marcarFallo: jest.fn(), marcarEnviado: jest.fn() };
    const venta = { folio: jest.fn().mockResolvedValue({ header: { CFDI_PAC: 'QUADRUM',
      CFDI_STATUS: 'TIMBRADO', CFDI_UUID: 'TEST-UUID' }, cliente: { EMAILRECEPTOR: 'customer@example.test' } }) };
    const xml = Buffer.from('<existing-xml/>'), pdf = Buffer.from('%PDF-existing');
    const documentos = { xml: jest.fn().mockResolvedValue({ contenido: xml }), pdf: jest.fn().mockResolvedValue({ contenido: pdf }) };
    const provider = { enviar: jest.fn().mockResolvedValue('gmail-test-id') };
    const service = new CfdiCorreoService(repo as unknown as CfdiCorreoRepositorio,
      venta as unknown as VentaRepositorio, documentos as unknown as DocumentosService,
      provider, {} as GoogleOAuthService, { get: () => key } as unknown as ConfigService);
    return { service, repo, venta, documentos, provider, trabajo, xml, pdf };
  }
  it.each(['ENVIADO', 'INCIERTO', 'PROCESANDO'])('blocks retry for %s', async estado => {
    const f = fixture(estado);
    await expect(f.service.reintentar(1)).rejects.toThrow();
    expect(f.repo.reintentar).not.toHaveBeenCalled();
  });
  it('rejects a changed UUID before enqueueing', async () => {
    const f = fixture(); f.trabajo.CFDI_UUID = 'OTHER-UUID';
    await expect(f.service.reintentar(1)).rejects.toThrow();
    expect(f.repo.reintentar).not.toHaveBeenCalled();
  });
  it('enqueues only selected existing job without sending synchronously', async () => {
    const f = fixture();
    await expect(f.service.reintentar(1)).resolves.toEqual({ encolado: true });
    expect(f.repo.reintentar).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(f.provider.enviar).not.toHaveBeenCalled();
  });
  it('passes existing document buffers and persists confirmed delivery', async () => {
    const f = fixture();
    await (f.service as any).procesarTrabajo(f.trabajo, 'sender@example.test', 'IOE');
    expect(f.provider.enviar).toHaveBeenCalledWith(expect.objectContaining({ adjuntos: [
      expect.objectContaining({ contenido: f.xml }), expect.objectContaining({ contenido: f.pdf }),
    ] }));
    expect(f.repo.marcarEnviado).toHaveBeenCalledWith({ id: 1, messageId: 'gmail-test-id' });
  });
  it('labels missing PDF without sending or exposing exception contents', async () => {
    const f = fixture(); f.documentos.pdf.mockRejectedValue(new Error('private-storage-path'));
    await (f.service as any).procesarTrabajo(f.trabajo, 'sender@example.test', 'IOE');
    expect(f.provider.enviar).not.toHaveBeenCalled();
    expect(f.repo.marcarFallo).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'ERROR_PROCESAMIENTO_PDF', estado: 'REINTENTABLE' }));
    expect(JSON.stringify(f.repo.marcarFallo.mock.calls)).not.toContain('private-storage-path');
  });
});
