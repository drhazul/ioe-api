import { GmailProvider } from './gmail.provider';
import { GoogleOAuthService } from './google-oauth.service';

describe('GmailProvider delivery contract', () => {
  const originalFetch = global.fetch;
  const mensaje = { desde: 'sender@example.test', para: 'receiver@example.test',
    nombreRemitente: 'IOE', asunto: 'CFDI existente', texto: 'Adjuntos existentes',
    adjuntos: [{ nombre: 'folio.xml', tipo: 'application/xml', contenido: Buffer.from('<xml/>') },
      { nombre: 'folio.pdf', tipo: 'application/pdf', contenido: Buffer.from('%PDF-test') }] };
  const provider = () => new GmailProvider({ accessToken: async () => 'test-token' } as GoogleOAuthService);
  afterEach(() => { global.fetch = originalFetch; });

  it('sends both existing buffers in MIME and returns confirmed message ID', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'gmail-test' }), { status: 200 }));
    global.fetch = fetchMock;
    await expect(provider().enviar(mensaje)).resolves.toBe('gmail-test');
    const raw = JSON.parse(fetchMock.mock.calls[0][1].body).raw;
    const mime = Buffer.from(raw, 'base64url').toString();
    expect(mime).toContain('filename="folio.xml"');
    expect(mime).toContain('filename="folio.pdf"');
    for (const archivo of mensaje.adjuntos) expect(mime).toContain(archivo.contenido.toString('base64'));
  });
  it.each([
    [403, 'insufficientPermissions', 'ERROR_FINAL'],
    [403, 'userRateLimitExceeded', 'REINTENTABLE'],
    [429, 'rateLimitExceeded', 'REINTENTABLE'],
    [503, 'backendError', 'INCIERTO'],
  ])('classifies HTTP %s / %s without disclosing provider message', async (status, reason, tipo) => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      message: 'private-address@example.test Bearer secret', errors: [{ reason }],
    } }), { status: Number(status) }));
    try { await provider().enviar(mensaje); throw new Error('Expected delivery rejection'); }
    catch (error) {
      expect(error).toMatchObject({ tipo, codigo: `GMAIL_HTTP_${status}` });
      expect(String(error)).not.toContain('private-address');
      expect(String(error)).not.toContain('Bearer secret');
    }
  });
  it('keeps unknown network outcome uncertain', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(provider().enviar(mensaje)).rejects.toMatchObject({ tipo: 'INCIERTO' });
  });
  it('does not treat HTTP success without message ID as confirmed delivery', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(provider().enviar(mensaje)).rejects.toMatchObject({ tipo: 'INCIERTO' });
  });
});
