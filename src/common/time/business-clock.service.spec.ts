import { BusinessClockService } from './business-clock.service';

describe('guardia compartida de reloj SQL', () => {
  it('no permite desactivar protección de IOELOCAL', () => {
    const config: any = {
      get: (key: string) => (key === 'DB_NAME' ? 'IOELOCAL' : false),
    };
    expect(new BusinessClockService({} as any, config).required).toBe(true);
  });
  const config: any = { get: () => true };
  it('impide escrituras si SQL sigue UTC', async () => {
    const db: any = {
      query: jest.fn().mockResolvedValue([
        {
          localWall: '2026-11-04T18:39:38.623',
          utcWall: '2026-11-04T18:39:38.623',
          zoneId: 'UTC',
        },
      ]),
    };
    await expect(
      new BusinessClockService(db, config).assertReady(),
    ).rejects.toThrow('Reloj SQL');
  });
  it('acepta SQL CDMX y evita una consulta por cada fila/request', async () => {
    const db: any = {
      query: jest.fn().mockResolvedValue([
        {
          localWall: '2026-11-04T12:39:38.623',
          utcWall: '2026-11-04T18:39:38.623',
          zoneId: 'Central Standard Time (Mexico)',
        },
      ]),
    };
    const clock = new BusinessClockService(db, config);
    await clock.assertReady();
    await clock.assertReady();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('falla cerrado si SQL no permite verificar reloj', async () => {
    const db: any = {
      query: jest.fn().mockRejectedValue(new Error('offline')),
    };
    await expect(
      new BusinessClockService(db, config).onModuleInit(),
    ).rejects.toThrow('Reloj SQL');
  });
});
