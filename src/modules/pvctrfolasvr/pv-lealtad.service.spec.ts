import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import { PvLealtadService } from './pv-lealtad.service';

describe('C01 participation HTTP boundary', () => {
  let service: PvLealtadService;
  let query: jest.Mock;
  let fetchMock: jest.Mock;
  let config: Record<string, string>;
  const originalFetch = global.fetch;
  const user = {
    sub: 7,
    roleId: 4,
    suc: 'DF01',
    username: 'uat',
  } as unknown as JwtPayload;
  const folio = 'DF01-20261023-CP-0002';
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    config = {
      RECOMPENSAS_API_URL: 'http://rewards.test/api/',
      RECOMPENSAS_API_USERNAME: 'technical-fixture',
      RECOMPENSAS_API_PASSWORD: 'test-only',
    };
    query = jest
      .fn()
      .mockResolvedValueOnce([{ IDFOL: folio, CLIEN: 50007, SUC: 'DF01' }])
      .mockResolvedValueOnce([{ IDC: 50007 }]);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new PvLealtadService(
      { query } as unknown as DataSource,
      { get: (key: string) => config[key] } as ConfigService,
    );
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([true, false])(
    'returns authoritative participation %s and never balance',
    async (participante) => {
      fetchMock
        .mockResolvedValueOnce(json({ token: 'fixture-token' }))
        .mockResolvedValueOnce(
          json({ ok: true, participante, idc: 50007, puntosDisponibles: 999 }),
        );
      await expect(
        service.consultarParticipacion(folio, user),
      ).resolves.toEqual({
        ok: true,
        idfol: folio,
        clienteId: '50007',
        participante,
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        'http://rewards.test/api/auth/login',
      );
      expect(fetchMock.mock.calls[1][0]).toBe(
        'http://rewards.test/api/mercader/fidelidad/cliente/50007',
      );
      expect(
        query.mock.calls.every(
          ([statement]) => !/\b(INSERT|UPDATE|DELETE|EXEC)\b/i.test(statement),
        ),
      ).toBe(true);
    },
  );
  it('reports missing URL before authentication', async () => {
    config.RECOMPENSAS_API_URL = '';
    await expect(
      service.consultarParticipacion(folio, user),
    ).rejects.toMatchObject({
      response: { code: 'LEALTAD_URL_NO_CONFIGURADA' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('reports missing API account without using SQL credentials', async () => {
    config.RECOMPENSAS_API_PASSWORD = '';
    config.DB_PASSWORD = 'sql-not-an-api-password';
    await expect(
      service.consultarParticipacion(folio, user),
    ).rejects.toMatchObject({
      response: { code: 'LEALTAD_CUENTA_NO_CONFIGURADA' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('supports privately configured FEDERADA API aliases', async () => {
    config.RECOMPENSAS_API_USERNAME = '';
    config.RECOMPENSAS_API_PASSWORD = '';
    config.USER_API_FEDERADA = 'technical-alias';
    config.PASSWORD_API_FEDERADA = 'test-alias-only';
    fetchMock
      .mockResolvedValueOnce(json({ token: 'fixture-token' }))
      .mockResolvedValueOnce(json({ ok: true, participante: false }));
    await service.consultarParticipacion(folio, user);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      nombreUsuario: 'technical-alias',
      password: 'test-alias-only',
    });
  });
  it('does not misclassify rejected login as a nonparticipant', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: 'private upstream details' }, 401),
    );
    await expect(
      service.consultarParticipacion(folio, user),
    ).rejects.toMatchObject({ response: { code: 'LEALTAD_AUTH_RECHAZADA' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('refreshes JWT once on expired participation token', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ token: 'expired' }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ token: 'renewed' }))
      .mockResolvedValueOnce(
        json({ ok: true, participante: true, idc: 50007 }),
      );
    await expect(
      service.consultarParticipacion(folio, user),
    ).resolves.toMatchObject({ participante: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe(
      'Bearer renewed',
    );
  });
  it('rejects a response for another client', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ token: 'fixture-token' }))
      .mockResolvedValueOnce(
        json({ ok: true, participante: true, idc: 50008 }),
      );
    await expect(
      service.consultarParticipacion(folio, user),
    ).rejects.toMatchObject({
      response: { code: 'LEALTAD_CLIENTE_INCONSISTENTE' },
    });
  });
  it('reports upstream timeout without revealing error details', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('private network detail'), {
        name: 'TimeoutError',
      }),
    );
    await expect(
      service.consultarParticipacion(folio, user),
    ).rejects.toMatchObject({ response: { code: 'LEALTAD_TIMEOUT' } });
  });
  it('checks branch before calling the external system', async () => {
    await expect(
      service.consultarParticipacion(folio, { ...user, suc: 'DF04' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
