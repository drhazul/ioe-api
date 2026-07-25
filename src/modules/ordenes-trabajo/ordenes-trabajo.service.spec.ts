import { OrdenesTrabajoService } from './ordenes-trabajo.service';

describe('OrdenesTrabajoService cambio material/merma', () => {
  function createService(query = jest.fn()) {
    const service = Object.create(
      OrdenesTrabajoService.prototype,
    ) as OrdenesTrabajoService;
    (service as any).dataSource = { query };
    return service;
  }

  describe('cálculo fiscal', () => {
    it('agrega IVA cuando venta fiscal requiere factura y DAT_SUC no integra IVA', () => {
      const service = createService();

      expect(
        (service as any).calculateFinanceByIva(130, {
          tipoTran: 'VF',
          ivaIntegrado: 0,
          rqfac: 1,
        }),
      ).toEqual({
        subtotal: 130,
        iva: 20.8,
        total: 150.8,
      });
    });

    it('desglosa IVA cuando DAT_SUC indica IVA integrado', () => {
      const service = createService();

      expect(
        (service as any).calculateFinanceByIva(150.8, {
          tipoTran: 'VF',
          ivaIntegrado: -1,
          rqfac: 1,
        }),
      ).toEqual({
        subtotal: 130,
        iva: 20.8,
        total: 150.8,
      });
    });

    it('no calcula IVA para transacción CA', () => {
      const service = createService();

      expect(
        (service as any).calculateFinanceByIva(130, {
          tipoTran: 'CA',
          ivaIntegrado: 0,
          rqfac: 1,
        }),
      ).toEqual({
        subtotal: 130,
        iva: 0,
        total: 130,
      });
    });
  });

  describe('base económica original', () => {
    it('conserva PVTAT histórico como total y deriva PVTA unitario', async () => {
      const query = jest.fn().mockResolvedValue([
        {
          PVTA_UNITARIO: null,
          PVTAT_BASE: 260,
          CTD_TICKET: 1,
        },
      ]);
      const service = createService(query);
      (service as any).hasTable = jest.fn(
        async (table: string) => table === 'PV_TICKET_LOG',
      );

      await expect(
        (service as any).resolveCambioMermaOriginalEconomicBase(
          'DF011',
          'FOL-1',
          '3012563',
          1,
          999,
        ),
      ).resolves.toEqual({
        unitPrice: 260,
        baseTotal: 260,
        source: 'PV_TICKET_LOG',
        warning: null,
      });
    });

    it('reconstruye ORD derivada con PVTA padre por cantidad propia', async () => {
      const query = jest.fn().mockResolvedValue([{ PVTA_UNITARIO: 260 }]);
      const service = createService(query);
      (service as any).hasTable = jest.fn(
        async (table: string) => table === 'PV_ORD_CAMBIO_MERMA_TMP',
      );

      await expect(
        (service as any).resolveCambioMermaOriginalEconomicBase(
          'DF01133520121',
          'DF01-20260717-VF-0027',
          '3012563',
          0.5,
          260,
        ),
      ).resolves.toEqual({
        unitPrice: 260,
        baseTotal: 130,
        source: 'CAPTURA_PADRE',
        warning: null,
      });
    });

    it('mantiene fallback de catálogo explícito y multiplicado por cantidad', async () => {
      const service = createService();
      (service as any).hasTable = jest.fn().mockResolvedValue(false);

      await expect(
        (service as any).resolveCambioMermaOriginalEconomicBase(
          'DF011',
          'FOL-1',
          '3012563',
          0.5,
          260,
        ),
      ).resolves.toEqual({
        unitPrice: 260,
        baseTotal: 130,
        source: 'DAT_ART_FALLBACK',
        warning:
          'No se localizó precio histórico de la ORD; se usó precio unitario actual de catálogo por la cantidad original.',
      });
    });

    it('prorratea 0.5 de ORD creada por 1 sin dividir precio unitario', () => {
      const service = createService();
      const baseOriginal = 260;
      const ctdOriginal = 1;
      const ctdAfectada = 0.5;
      const baseAfectada = (service as any).roundMoney(
        baseOriginal * (ctdAfectada / ctdOriginal),
      );
      const nuevoBase = (service as any).roundMoney(260 * ctdAfectada);

      expect(baseAfectada).toBe(130);
      expect(nuevoBase).toBe(130);
      expect(
        (service as any).calculateFinanceByIva(nuevoBase, {
          tipoTran: 'VF',
          ivaIntegrado: 0,
          rqfac: 1,
        }).total -
          (service as any).calculateFinanceByIva(baseAfectada, {
            tipoTran: 'VF',
            ivaIntegrado: 0,
            rqfac: 1,
          }).total,
      ).toBe(0);
    });
  });
});
