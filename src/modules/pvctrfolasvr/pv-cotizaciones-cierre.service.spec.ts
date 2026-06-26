import { DataSource } from 'typeorm';
import { PvCotizacionesCierreService } from './pv-cotizaciones-cierre.service';

describe('PvCotizacionesCierreService preview', () => {
  it('excluye contramovimientos de ORD relacionada del total base', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          IDFOL: 'DF01-20260622-CP-0066',
          SUC: 'DF01',
          CLIEN: 50078,
          ESTA: 'PENDIENTE',
          REQF: 0,
        },
      ])
      .mockResolvedValueOnce([
        { COL: 'CTD' },
        { COL: 'PVTA' },
        { COL: 'TICKET_REL' },
      ])
      .mockImplementationOnce((sql: string) => {
        expect(sql).toContain('TICKET_REL');
        expect(sql).toContain('THEN 0');
        return Promise.resolve([{ ITEMS_COUNT: 3, TOTAL_BASE: 65 }]);
      })
      .mockResolvedValueOnce([{ IVA_INTEGRADO: 1 }]);

    const service = new PvCotizacionesCierreService({
      query,
    } as unknown as DataSource);

    const response = await service.preview(
      'DF01-20260622-CP-0066',
      { tipotran: 'CA', rqfac: false, suc: 'DF01' },
      { sub: 1, username: 'ADMIN', roleId: 1, suc: 'DF01' } as any,
    );

    expect(response.context.itemsCount).toBe(3);
    expect(response.context.totalBase).toBe(65);
    expect(response.totals.total).toBe(65);
  });
});
