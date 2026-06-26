import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PvCotizacionCierreDto } from './dto/pv-cotizacion-cierre.dto';
import { PvCotizacionesCierreService } from './pv-cotizaciones-cierre.service';

describe('PvCotizacionCierreDto', () => {
  it('permite formas vacias para cierre en cero', async () => {
    const dto = plainToInstance(PvCotizacionCierreDto, {
      suc: 'DF10',
      tipotran: 'CA',
      rqfac: false,
      formas: [],
    });

    const errors = await validate(dto);
    const messages = JSON.stringify(errors);

    expect(messages).not.toContain('formas must contain at least 1 elements');
    expect(errors).toHaveLength(0);
  });
});

describe('PvCotizacionesCierreService preview', () => {
  it('suma todos los renglones capturados aunque incluyan contramovimiento', async () => {
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
      .mockImplementationOnce((sql: string) => {
        expect(sql).toContain('COUNT(1) AS ITEMS_COUNT');
        expect(sql).toContain('SUM(ISNULL(CTD, 0) * ISNULL(PVTA, 0))');
        expect(sql).not.toContain('TICKET_REL');
        return Promise.resolve([{ ITEMS_COUNT: 2, TOTAL_BASE: 0 }]);
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

    expect(response.context.itemsCount).toBe(2);
    expect(response.context.totalBase).toBe(0);
    expect(response.totals.total).toBe(0);
  });
});
