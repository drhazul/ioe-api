import { DataSource } from 'typeorm';
import { TransferenciasService } from './transferencias.service';

describe('TransferenciasService', () => {
  const user = {
    sub: 10,
    username: 'UJEFEINV',
    suc: 'DF01',
    roleId: 2,
  } as never;

  function setup() {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ CODIGO: 'INVJEF', NOMBRE: 'JEFE' }])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);
    const service = new TransferenciasService({
      query,
    } as unknown as DataSource);
    return { service, query };
  }

  it('muestra PENDIENTE y BORRADOR en la cola general del jefe', async () => {
    const { service, query } = setup();

    await service.findAll({}, user);

    const countParams = query.mock.calls[1][1] as string[];
    expect(countParams).toContain('PENDIENTE');
    expect(countParams).toContain('BORRADOR');
  });

  it.each([
    ['documento', { doc: '350000443' }],
    ['usuario', { usuario: 'UDF01JA04' }],
    ['fecha', { from: '2026-10-05', to: '2026-10-05' }],
    ['sucursal', { suc: 'DF04' }],
  ])('conserva BORRADOR cuando el jefe filtra por %s', async (_, filters) => {
    const { service, query } = setup();

    await service.findAll(filters, user);

    const countParams = query.mock.calls[1][1] as string[];
    expect(countParams).toEqual(
      expect.arrayContaining(['PENDIENTE', 'BORRADOR']),
    );
  });

  it('permite al jefe encontrar un borrador de otra sucursal por documento', async () => {
    const { service, query } = setup();

    await service.findAll({ doc: '350000445' }, user);

    const countSql = query.mock.calls[1][0] as string;
    const countParams = query.mock.calls[1][1] as string[];
    expect(countSql).not.toContain('USR_MOD_SUC');
    expect(countParams).toEqual(
      expect.arrayContaining(['%350000445%', 'PENDIENTE', 'BORRADOR']),
    );
  });

  it('aplica la sucursal seleccionada sin recortar el acceso global del jefe', async () => {
    const { service, query } = setup();

    await service.findAll({ suc: 'df04' }, user);

    const countSql = query.mock.calls[1][0] as string;
    const countParams = query.mock.calls[1][1] as string[];
    expect(countSql).toContain('h.SUC_ENT');
    expect(countSql).toContain('h.SUC_SAL');
    expect(countParams).toEqual(
      expect.arrayContaining(['DF04', 'PENDIENTE', 'BORRADOR']),
    );
  });
});
