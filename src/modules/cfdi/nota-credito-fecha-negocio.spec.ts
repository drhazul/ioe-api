import { NotaCreditoRepositorio } from './nota-credito.repositorio';

describe('fecha comercial del consecutivo compartido NC/REP', () => {
  it.each(['NC', 'PG'] as const)(
    '%s conserva día CDMX tras cruce UTC',
    async (tipo) => {
      const query = jest
        .fn()
        .mockResolvedValue([
          { IDFOL: 'PRUEBA', SERIE: 'TEST', FOLIO: '1', NOMENCLATURA: 'TEST1' },
        ]);
      const repo = new NotaCreditoRepositorio({ query } as any);
      await repo.reservarFolio({
        idFolOrigen: 'ORIGEN',
        rfcEmisor: 'RFC_PRUEBA',
        fecha: new Date('2026-11-05T00:23:00.000Z'),
        tipo,
      });
      expect(query.mock.calls[0][1][2]).toBe('2026-11-04');
      expect(query.mock.calls[0][1][4]).toBe(tipo);
    },
  );
  it.each(['NC', 'PG'] as const)(
    '%s cambia día al llegar medianoche CDMX',
    async (tipo) => {
      const query = jest.fn().mockResolvedValue([{ IDFOL: 'PRUEBA' }]);
      const repo = new NotaCreditoRepositorio({ query } as any);
      await repo.reservarFolio({
        idFolOrigen: 'ORIGEN',
        rfcEmisor: 'RFC_PRUEBA',
        fecha: new Date('2026-11-05T06:00:00.000Z'),
        tipo,
      });
      expect(query.mock.calls[0][1][2]).toBe('2026-11-05');
    },
  );
});
