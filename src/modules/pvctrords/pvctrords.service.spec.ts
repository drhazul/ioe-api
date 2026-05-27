import { HttpException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { CreateOrdFromQuoteLineDto } from './dto/create-ord-from-quote-line.dto';
import { PvCtrOrdsEntity } from './pvctrords.entity';
import { PvCtrOrdsService } from './pvctrords.service';

describe('PvCtrOrdsService.createFromQuoteLine', () => {
  let service: PvCtrOrdsService;
  let dataSource: { query: jest.Mock };

  const baseDto: CreateOrdFromQuoteLineDto = {
    idfol: 'DF01040220261210',
    ticketId: '75a760b7-0bc3-4647-be8f-8bd3ab515f47',
    art: 'ART-001',
    descArt: 'Articulo demo',
    ctd: 1,
    clien: 2,
    estado: 'PENDIENTE',
    tipo: 'LAB',
    suc: 'DF01',
    opv: '5001',
    fechaEntrega: '2026-02-13T12:00:00.000Z',
    comad: 'Comentario obligatorio',
    ordExistente: undefined,
  };

  beforeEach(() => {
    const repo = {} as Repository<PvCtrOrdsEntity>;
    dataSource = {
      query: jest.fn(),
    };
    service = new PvCtrOrdsService(repo, dataSource as unknown as DataSource);
  });

  it('crea ORD y devuelve encabezado + detalles', async () => {
    const iord = 'DF01131930001';

    dataSource.query
      .mockResolvedValueOnce([
        { ART: baseDto.art, CTD: baseDto.ctd, ORD: null },
      ])
      .mockResolvedValueOnce([{ IORD: iord }])
      .mockResolvedValueOnce([{ IORD: iord, IDFOL: baseDto.idfol }])
      .mockResolvedValueOnce([
        { IORDP: `1${iord}`, IORD: iord, JOB: 'OD' },
        { IORDP: `2${iord}`, IORD: iord, JOB: 'OI' },
        { IORDP: `3${iord}`, IORD: iord, JOB: 'ADD' },
      ]);

    const result = await service.createFromQuoteLine(baseDto);

    expect(result.created).toBe(true);
    expect(result.iord).toBe(iord);
    expect(result.header?.IORD).toBe(iord);
    expect(result.details).toHaveLength(3);
    expect(dataSource.query).toHaveBeenCalledTimes(4);
  });

  it('rechaza cuando clien = 1', async () => {
    await expect(
      service.createFromQuoteLine({
        ...baseDto,
        clien: 1,
      }),
    ).rejects.toBeInstanceOf(HttpException);

    await assertErrorCode(
      () =>
        service.createFromQuoteLine({
          ...baseDto,
          clien: 1,
        }),
      'CLIENT_REQUIRED',
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('rechaza cuando estado != PENDIENTE', async () => {
    await assertErrorCode(
      () =>
        service.createFromQuoteLine({
          ...baseDto,
          estado: 'CERRADO',
        }),
      'INVALID_STATUS',
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('rechaza cuando ctd no es 1 o 0.5', async () => {
    dataSource.query.mockResolvedValueOnce([
      { ART: baseDto.art, CTD: 2, ORD: null },
    ]);
    await assertErrorCode(
      () =>
        service.createFromQuoteLine({
          ...baseDto,
          ticketId: 'linea-qty-invalida',
        }),
      'INVALID_QTY',
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('rechaza cuando falta fecha de entrega', async () => {
    dataSource.query.mockResolvedValueOnce([
      { ART: baseDto.art, CTD: baseDto.ctd, ORD: null },
    ]);
    await assertErrorCode(
      () =>
        service.createFromQuoteLine({
          ...baseDto,
          fechaEntrega: undefined,
        }),
      'FCNM_REQUIRED',
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('rechaza cuando COMAD esta vacio', async () => {
    dataSource.query.mockResolvedValueOnce([
      { ART: baseDto.art, CTD: baseDto.ctd, ORD: null },
    ]);
    await assertErrorCode(
      () =>
        service.createFromQuoteLine({
          ...baseDto,
          comad: '   ',
        }),
      'COMAD_REQUIRED',
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('actualiza ORD existente cuando ordExistente > 0', async () => {
    const existingIord = 'DF01131930009';
    dataSource.query
      .mockResolvedValueOnce([
        { ART: baseDto.art, CTD: baseDto.ctd, ORD: existingIord },
      ])
      .mockResolvedValueOnce([{ IORD: existingIord }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ IORD: existingIord, IDFOL: baseDto.idfol }])
      .mockResolvedValueOnce([
        { IORDP: `1${existingIord}`, IORD: existingIord, JOB: 'OD' },
      ]);

    const result = await service.createFromQuoteLine({
      ...baseDto,
      ordExistente: existingIord,
    });

    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
    expect(result.iord).toBe(existingIord);
    expect(result.message).toBe('ORD existente actualizada correctamente');
    expect(dataSource.query).toHaveBeenCalledTimes(5);
  });
});

async function assertErrorCode(
  fn: () => Promise<unknown>,
  expectedCode: string,
) {
  try {
    await fn();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const response = (error as HttpException).getResponse() as Record<
      string,
      unknown
    >;
    expect(response.code).toBe(expectedCode);
    return;
  }
  throw new Error(`Expected HttpException with code ${expectedCode}`);
}
