import { DataSource } from 'typeorm';
import { RecepcionesService } from './recepciones.service';

describe('RecepcionesService', () => {
  it('excluye PARCIAL y CONTABILIZADO de Pedidos pendientes del jefe', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          IDUSUARIO: 10,
          USERNAME: 'UJEFEINV',
          SUC: 'DF01',
          IDROL: 2,
          ROLE_CODE: 'INVJEF',
          ROLE_NAME: 'JEFE DE INVENTARIOS',
        },
      ])
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);
    const service = new RecepcionesService({
      query,
    } as unknown as DataSource);

    await service.findAll({ suc: 'DF01' }, {
      sub: 10,
      username: 'UJEFEINV',
      suc: 'DF01',
      roleId: 2,
    } as never);

    const countSql = query.mock.calls[1][0] as string;
    expect(countSql).toContain("IN ('PROCESADO', 'VALIDADO', 'RECHAZADO')");
    expect(countSql).not.toContain("'PARCIAL'");
    expect(countSql).not.toContain("'CONTABILIZADO'");
  });
});
