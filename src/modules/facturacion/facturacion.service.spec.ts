import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { JwtPayload } from '../auth/jwt.strategy';
import type { FactClientShpEntity } from '../factclientshp/factclientshp.entity';
import { FactClientShpService } from '../factclientshp/factclientshp.service';
import { FacturifyClient } from './facturify.client';
import { FacturacionService } from './facturacion.service';

describe('FacturacionService.actualizarClienteFiscal', () => {
  type AssertAccess = (
    user?: JwtPayload | null,
    action?: string,
  ) => Promise<void>;
  type GetFolioData = (idFol: string) => Promise<unknown>;
  type TestableFacturacionService = {
    assertFacturacionWriteAccess: AssertAccess;
    getFolioData: GetFolioData;
  };

  const dataSource = {} as DataSource;
  const facturify = {} as FacturifyClient;
  const config = {} as ConfigService;
  const updateFromFacturacion =
    jest.fn<FactClientShpService['updateFromFacturacion']>();
  const factClientShpService = {
    updateFromFacturacion,
  } as unknown as FactClientShpService;
  const user = { username: 'udf01facturacion' } as JwtPayload;

  let service: FacturacionService;
  let assertAccess: jest.MockedFunction<AssertAccess>;
  let getFolioData: jest.MockedFunction<GetFolioData>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FacturacionService(
      dataSource,
      facturify,
      config,
      factClientShpService,
    );
    assertAccess = jest.fn<AssertAccess>().mockResolvedValue(undefined);
    getFolioData = jest.fn<GetFolioData>();
    const internals = service as unknown as TestableFacturacionService;
    internals.assertFacturacionWriteAccess = assertAccess;
    internals.getFolioData = getFolioData;
  });

  it('actualiza el cliente asociado al folio pendiente con permiso FACTURA', async () => {
    getFolioData.mockResolvedValue({
      header: { ESTATUS: 'PENDIENTE' },
      cliente: { IDC: 1462270003 },
    });
    updateFromFacturacion.mockResolvedValue({
      IDC: 1462270003,
    } as FactClientShpEntity);

    const dto = { RFCRECEPTOR: 'DOSA701224CG3' };
    const result = await service.actualizarClienteFiscal(
      ' om01-20260724-vf-0003 ',
      dto,
      user,
    );

    expect(getFolioData).toHaveBeenCalledWith('OM01-20260724-VF-0003');
    expect(updateFromFacturacion).toHaveBeenCalledWith(1462270003, dto);
    expect(result).toEqual({ IDC: 1462270003 });
  });

  it('no permite editar cliente de folio que ya no está pendiente', async () => {
    getFolioData.mockResolvedValue({
      header: { ESTATUS: 'FACTURADO' },
      cliente: { IDC: 1462270003 },
    });

    await expect(
      service.actualizarClienteFiscal('OM01-20260724-VF-0003', {}, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateFromFacturacion).not.toHaveBeenCalled();
  });

  it('conserva rechazo cuando usuario no tiene permiso de gestión', async () => {
    assertAccess.mockRejectedValue(new ForbiddenException('Sin permisos'));

    await expect(
      service.actualizarClienteFiscal('OM01-20260724-VF-0003', {}, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(getFolioData).not.toHaveBeenCalled();
    expect(updateFromFacturacion).not.toHaveBeenCalled();
  });
});
