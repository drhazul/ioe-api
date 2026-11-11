import { DataSource } from 'typeorm';
import { SugeridosService } from './sugeridos.service';

describe('Sugeridos sucursales', () => {
  const user = {
    sub: 10,
    username: 'TEST',
    roleId: 13008,
    suc: 'DF01',
  } as never;
  it('permite calcular sucursal autorizada existente en DAT_SUC', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ CODIGO: 'ENC_SUCURSAL' }])
      .mockResolvedValueOnce([{ SUC: 'DF24' }])
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([]);
    const service = new SugeridosService({ query } as unknown as DataSource);
    await expect(
      service.calcular({ suc: 'DF24' }, user),
    ).resolves.toMatchObject({ total: 0 });
    expect(query.mock.calls[3][1][0]).toBe('DF24');
  });
  it('rechaza sucursal no autorizada antes de calcular', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ CODIGO: 'ENC_SUCURSAL' }])
      .mockResolvedValueOnce([]);
    const service = new SugeridosService({ query } as unknown as DataSource);
    await expect(service.calcular({ suc: 'DF24' }, user)).rejects.toThrow(
      'No autorizado',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rechaza sucursal inexistente aunque figure autorizada', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ CODIGO: 'ENC_SUCURSAL' }])
      .mockResolvedValueOnce([{ SUC: 'DF24' }])
      .mockResolvedValueOnce([]);
    const service = new SugeridosService({ query } as unknown as DataSource);
    await expect(service.calcular({ suc: 'DF24' }, user)).rejects.toThrow(
      'no existe',
    );
    expect(query).toHaveBeenCalledTimes(3);
  });
});
