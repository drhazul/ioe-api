import { Test } from '@nestjs/testing';
import { DevolucionesProveedorController } from './devoluciones-proveedor.controller';
import { DevolucionesProveedorService } from './devoluciones-proveedor.service';

describe('DevolucionesProveedorController', () => {
  it('delega el listado al servicio con filtros y usuario', async () => {
    const service = {
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const module = await Test.createTestingModule({
      controllers: [DevolucionesProveedorController],
      providers: [{ provide: DevolucionesProveedorService, useValue: service }],
    }).compile();
    const controller = module.get(DevolucionesProveedorController);
    const query = { page: 1, limit: 30 };
    const user = { sub: 1003, username: 'udf01ja04', roleId: 2 } as any;
    await expect(controller.findAll(query, user)).resolves.toEqual({
      items: [],
      total: 0,
    });
    expect(service.findAll).toHaveBeenCalledWith(query, user);
  });

  it('delega el reemplazo de evidencia con documento y renglon', async () => {
    const service = {
      updateEvidencia: jest.fn().mockResolvedValue([]),
    };
    const module = await Test.createTestingModule({
      controllers: [DevolucionesProveedorController],
      providers: [{ provide: DevolucionesProveedorService, useValue: service }],
    }).compile();
    const controller = module.get(DevolucionesProveedorController);
    const dto = {
      nombreArchivo: 'evidencia.jpg',
      mimeType: 'image/jpeg',
      contenido: 'data:image/jpeg;base64,abc',
    };
    const user = { sub: 1003, username: 'udf01ja04', roleId: 2 } as any;

    await expect(
      controller.updateEvidencia('DEV-1', '10', 'evidence-id', dto, user),
    ).resolves.toEqual([]);
    expect(service.updateEvidencia).toHaveBeenCalledWith(
      'DEV-1',
      '10',
      'evidence-id',
      dto,
      user,
    );
  });

  it('delega las transiciones de transito y recepcion', async () => {
    const service = {
      enviarTransito: jest.fn().mockResolvedValue({ estatus: 'EN_TRANSITO' }),
      recibir: jest.fn().mockResolvedValue({ estatus: 'RECIBIDA' }),
    };
    const module = await Test.createTestingModule({
      controllers: [DevolucionesProveedorController],
      providers: [{ provide: DevolucionesProveedorService, useValue: service }],
    }).compile();
    const controller = module.get(DevolucionesProveedorController);
    const user = { sub: 1003, username: 'udf01ja04', roleId: 2 } as any;
    const dto = {
      transportista: 'Paqueteria',
      guia: 'GUIA-1',
      cajas: 1,
    };

    await controller.transito('DEV-1', dto, user);
    await controller.recibir('DEV-1', user);

    expect(service.enviarTransito).toHaveBeenCalledWith('DEV-1', dto, user);
    expect(service.recibir).toHaveBeenCalledWith('DEV-1', user);
  });
});
