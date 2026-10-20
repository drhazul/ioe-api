import { OrdenesTrabajoService } from './ordenes-trabajo.service';

describe('OrdenesTrabajoService cambio material/merma', () => {
  function createService(query = jest.fn()) {
    const service = Object.create(
      OrdenesTrabajoService.prototype,
    ) as OrdenesTrabajoService;
    (service as any).dataSource = { query };
    return service;
  }

  describe('consulta estado', () => {
    it('incluye SIN FLUJO en los modos operativo y estado autorizados', () => {
      const service = createService();
      const admin = { username: 'ADMIN', sub: 1 } as any;

      expect(
        (service as any).shouldIncludeNullFlow(admin, 'ADMIN', 'operativo'),
      ).toBe(true);
      expect(
        (service as any).shouldIncludeNullFlow(admin, 'ADMIN', 'estado'),
      ).toBe(true);
      expect(
        (service as any).shouldIncludeNullFlow(admin, 'ADMIN', 'anulados'),
      ).toBe(false);
    });

    it('consulta Todos sin exigir otro filtro en el panel estado', () => {
      const service = createService();

      expect((service as any).shouldDeferPanel({}, 'estado', true)).toBe(false);
      expect((service as any).shouldDeferPanel({}, 'entregadas', true)).toBe(
        true,
      );
    });

    it('arma el historial por ORD y evita una celda vacía', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ ok: 1 }])
        .mockResolvedValueOnce([
          { IORD: 'DF01001', ESTSEGU: null, ESTSEGU_DESC: '' },
          { IORD: 'DF01001', ESTSEGU: 3, ESTSEGU_DESC: 'AUTORIZADA' },
          { IORD: 'DF01001', ESTSEGU: 5, ESTSEGU_DESC: 'EN TALLER' },
        ]);
      const service = createService(query);

      await expect(
        (service as any).attachFlowHistory([
          {
            IORD: 'DF01001',
            ESTSEGU: 5,
            ESTSEGU_DESC: 'EN TALLER',
          },
        ]),
      ).resolves.toEqual([
        {
          IORD: 'DF01001',
          ESTSEGU: 5,
          ESTSEGU_DESC: 'EN TALLER',
          FLUJO_HISTORIAL: 'SIN FLUJO -> 3 AUTORIZADA -> 5 EN TALLER',
          FLUJO_HISTORIAL_ITEMS: [
            { ESTSEGU: null, ESTSEGU_DESC: '' },
            { ESTSEGU: 3, ESTSEGU_DESC: 'AUTORIZADA' },
            { ESTSEGU: 5, ESTSEGU_DESC: 'EN TALLER' },
          ],
        },
      ]);
    });

    it('usa el flujo actual si la tabla histórica todavía no existe', async () => {
      const query = jest.fn().mockResolvedValueOnce([]);
      const service = createService(query);

      await expect(
        (service as any).attachFlowHistory([
          {
            IORD: 'DF01002',
            ESTSEGU: 7,
            ESTSEGU_DESC: 'RECIBIDA',
          },
        ]),
      ).resolves.toEqual([
        {
          IORD: 'DF01002',
          ESTSEGU: 7,
          ESTSEGU_DESC: 'RECIBIDA',
          FLUJO_HISTORIAL: '7 RECIBIDA',
          FLUJO_HISTORIAL_ITEMS: [{ ESTSEGU: 7, ESTSEGU_DESC: 'RECIBIDA' }],
        },
      ]);
    });

    it('expande una ORD en una fila por cada flujo recorrido', () => {
      const service = createService();
      expect(
        (service as any).expandFlowHistoryItems([
          {
            IORD: 'DF01003',
            ESTSEGU: 5,
            ESTSEGU_DESC: 'EN TALLER',
            FLUJO_HISTORIAL_ITEMS: [
              { ESTSEGU: 3, ESTSEGU_DESC: 'AUTORIZADA' },
              { ESTSEGU: 5, ESTSEGU_DESC: 'EN TALLER' },
            ],
          },
        ]),
      ).toEqual([
        {
          IORD: 'DF01003',
          ESTSEGU: 3,
          ESTSEGU_DESC: 'AUTORIZADA',
          ESTSEGU_ACTUAL: 5,
          ESTSEGU_ACTUAL_DESC: 'EN TALLER',
        },
        {
          IORD: 'DF01003',
          ESTSEGU: 5,
          ESTSEGU_DESC: 'EN TALLER',
          ESTSEGU_ACTUAL: 5,
          ESTSEGU_ACTUAL_DESC: 'EN TALLER',
        },
      ]);
    });

    it('aplica la visibilidad al flujo historico solicitado, no al actual', () => {
      const service = createService();
      const rows = [
        { IORD: 'DF01004', ESTSEGU: 5, ESTSEGU_DESC: 'EN TALLER' },
      ];

      expect(
        (service as any).applyAllowedStatusFilterToItems(rows, [3], false, '3'),
      ).toEqual(rows);
      expect(
        (service as any).applyAllowedStatusFilterToItems(rows, [5], false, '3'),
      ).toEqual([]);
    });
  });

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
