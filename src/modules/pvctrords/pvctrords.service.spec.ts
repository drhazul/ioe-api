import { HttpException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CreateOrdFromQuoteLineDto } from './dto/create-ord-from-quote-line.dto';
import { PvCtrOrdsEntity } from './pvctrords.entity';
import { PvCtrOrdsRelationAuthStore } from './pvctrords-relation-auth.store';
import { PvCtrOrdsService } from './pvctrords.service';

describe('PvCtrOrdsService.createFromQuoteLine', () => {
  let service: PvCtrOrdsService;
  let dataSource: {
    query: jest.Mock;
    createQueryRunner: jest.Mock;
  };
  let relationAuthStore: {
    validate: jest.Mock;
    issue: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    query: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
  };

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
    ticketRel: undefined,
    relationAuthorizationToken: undefined,
  };

  const baseUser = {
    sub: 10,
    username: 'opv_demo',
    suc: 'DF01',
  } as any;

  beforeEach(() => {
    const repo = {} as Repository<PvCtrOrdsEntity>;
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    dataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn(() => queryRunner),
    };
    const audit = {
      log: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    relationAuthStore = {
      validate: jest.fn(),
      issue: jest.fn(),
    };
    service = new PvCtrOrdsService(
      repo,
      dataSource as unknown as DataSource,
      audit,
      relationAuthStore as unknown as PvCtrOrdsRelationAuthStore,
    );
  });

  it('crea ORD y devuelve encabezado + detalles', async () => {
    const iord = 'DF01131930001';

    dataSource.query
      .mockResolvedValueOnce([
        { ID: baseDto.ticketId, ART: baseDto.art, CTD: baseDto.ctd, ORD: null },
      ])
      .mockResolvedValueOnce([{ USERNAME: 'opv_demo' }]);
    queryRunner.query
      .mockResolvedValueOnce([{ IORD: iord }])
      .mockResolvedValueOnce([{ IORD: iord, IDFOL: baseDto.idfol }])
      .mockResolvedValueOnce([
        { IORDP: `1${iord}`, IORD: iord, JOB: 'OD' },
        { IORDP: `2${iord}`, IORD: iord, JOB: 'OI' },
        { IORDP: `3${iord}`, IORD: iord, JOB: 'ADD' },
      ]);

    const result = await service.createFromQuoteLine(baseDto, baseUser, null);

    expect(result.created).toBe(true);
    expect(result.iord).toBe(iord);
    expect(result.header?.IORD).toBe(iord);
    expect(result.details).toHaveLength(3);
    expect(dataSource.query).toHaveBeenCalledTimes(2);
    expect(queryRunner.query).toHaveBeenCalledTimes(3);
  });

  it('rechaza cuando clien = 1', async () => {
    await expect(
      service.createFromQuoteLine(
        {
          ...baseDto,
          clien: 1,
        },
        baseUser,
        null,
      ),
    ).rejects.toBeInstanceOf(HttpException);

    await assertErrorCode(
      () =>
        service.createFromQuoteLine(
          {
            ...baseDto,
            clien: 1,
          },
          baseUser,
          null,
        ),
      'CLIENT_REQUIRED',
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('rechaza cuando estado != PENDIENTE', async () => {
    await assertErrorCode(
      () =>
        service.createFromQuoteLine(
          {
            ...baseDto,
            estado: 'CERRADO',
          },
          baseUser,
          null,
        ),
      'INVALID_STATUS',
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('rechaza cuando ctd no es 1 o 0.5', async () => {
    dataSource.query.mockResolvedValueOnce([
      { ID: baseDto.ticketId, ART: baseDto.art, CTD: 2, ORD: null },
    ]);
    await assertErrorCode(
      () =>
        service.createFromQuoteLine(
          {
            ...baseDto,
            ticketId: 'linea-qty-invalida',
          },
          baseUser,
          null,
        ),
      'INVALID_QTY',
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('rechaza cuando falta fecha de entrega', async () => {
    dataSource.query.mockResolvedValueOnce([
      { ID: baseDto.ticketId, ART: baseDto.art, CTD: baseDto.ctd, ORD: null },
    ]);
    await assertErrorCode(
      () =>
        service.createFromQuoteLine(
          {
            ...baseDto,
            fechaEntrega: undefined,
          },
          baseUser,
          null,
        ),
      'FCNM_REQUIRED',
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('rechaza cuando COMAD esta vacio', async () => {
    dataSource.query.mockResolvedValueOnce([
      { ID: baseDto.ticketId, ART: baseDto.art, CTD: baseDto.ctd, ORD: null },
    ]);
    await assertErrorCode(
      () =>
        service.createFromQuoteLine(
          {
            ...baseDto,
            comad: '   ',
          },
          baseUser,
          null,
        ),
      'COMAD_REQUIRED',
    );
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('actualiza ORD existente cuando ordExistente > 0', async () => {
    const existingIord = 'DF01131930009';
    dataSource.query
      .mockResolvedValueOnce([
        {
          ID: baseDto.ticketId,
          ART: baseDto.art,
          CTD: baseDto.ctd,
          ORD: existingIord,
        },
      ])
      .mockResolvedValueOnce([{ USERNAME: 'opv_demo' }]);
    queryRunner.query
      .mockResolvedValueOnce([{ IORD: existingIord }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ IORD: existingIord, IDFOL: baseDto.idfol }])
      .mockResolvedValueOnce([
        { IORDP: `1${existingIord}`, IORD: existingIord, JOB: 'OD' },
      ]);

    const result = await service.createFromQuoteLine(
      {
        ...baseDto,
        ordExistente: existingIord,
      },
      baseUser,
      null,
    );

    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
    expect(result.iord).toBe(existingIord);
    expect(result.message).toBe('ORD existente actualizada correctamente');
    expect(dataSource.query).toHaveBeenCalledTimes(2);
    expect(queryRunner.query).toHaveBeenCalledTimes(4);
  });

  it('rechaza ticket relacionado de cliente distinto', async () => {
    relationAuthStore.validate.mockReturnValue({
      supervisorUserId: 77,
      requestedByUserId: baseUser.sub,
    });
    dataSource.query
      .mockResolvedValueOnce([
        { ID: baseDto.ticketId, ART: baseDto.art, CTD: baseDto.ctd, ORD: null },
      ])
      .mockResolvedValueOnce([{ USERNAME: 'opv_demo' }]);
    queryRunner.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ID: 'linea-rel-cliente-distinto' }]);

    await assertErrorCode(
      () =>
        service.createFromQuoteLine(
          {
            ...baseDto,
            ticketRel: 'DF10-REL-0001',
            relationAuthorizationToken: 'tok-rel-001',
          },
          baseUser,
          null,
        ),
      'RELATED_TICKET_CLIENT_MISMATCH',
    );
  });

  it('crea contramovimiento relacionado sin heredar ORD', async () => {
    const iord = 'DF01131939999';
    relationAuthStore.validate.mockReturnValue({
      supervisorUserId: 77,
      requestedByUserId: baseUser.sub,
    });
    dataSource.query
      .mockResolvedValueOnce([
        {
          ID: baseDto.ticketId,
          IDFOL: baseDto.idfol,
          UPC: '750000000001',
          ART: baseDto.art,
          DES: baseDto.descArt,
          CTD: baseDto.ctd,
          PVTA: 100,
          PVTAT: 100,
          ORD: null,
          IDDEV: null,
          CTDD: null,
          CTDDF: null,
          TICKET_REL: null,
        },
      ])
      .mockResolvedValueOnce([{ USERNAME: 'opv_demo' }]);
    queryRunner.query
      .mockResolvedValueOnce([{ ID: 'linea-rel-ok' }])
      .mockResolvedValueOnce([{ IORD: iord }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ IORD: iord, IDFOL: baseDto.idfol }])
      .mockResolvedValueOnce([{ IORDP: `1${iord}`, IORD: iord, JOB: 'OD' }]);

    const result = await service.createFromQuoteLine(
      {
        ...baseDto,
        ticketRel: 'DF10-REL-0002',
        relationAuthorizationToken: 'tok-rel-002',
      },
      baseUser,
      null,
    );

    expect(result.created).toBe(true);
    const insertCall = queryRunner.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO dbo.PV_TICKET_LOG'),
    );
    expect(insertCall).toBeDefined();
    expect(String(insertCall?.[0])).toContain('NULL,');
    expect(insertCall?.[1]).not.toContain(iord);
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
