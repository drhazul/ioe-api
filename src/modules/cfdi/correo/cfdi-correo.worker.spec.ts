import { ConfigService } from '@nestjs/config';
import { CfdiCorreoWorker } from './cfdi-correo.worker';
import { CfdiCorreoService } from './cfdi-correo.service';

describe('CfdiCorreoWorker isolation', () => {
  it.each([undefined, 'false', '1'])('does not touch the shared queue when flag is %s', async value => {
    const correo = { procesarPendientes: jest.fn(), reconciliar: jest.fn() };
    const worker = new CfdiCorreoWorker(correo as unknown as CfdiCorreoService,
      { get: () => value } as unknown as ConfigService);
    await worker.procesar();
    await worker.reconciliar();
    expect(correo.procesarPendientes).not.toHaveBeenCalled();
    expect(correo.reconciliar).not.toHaveBeenCalled();
  });
  it('allows both jobs only with explicit true', async () => {
    const correo = { procesarPendientes: jest.fn(), reconciliar: jest.fn() };
    const worker = new CfdiCorreoWorker(correo as unknown as CfdiCorreoService,
      { get: () => 'true' } as unknown as ConfigService);
    await worker.procesar();
    await worker.reconciliar();
    expect(correo.procesarPendientes).toHaveBeenCalledTimes(1);
    expect(correo.reconciliar).toHaveBeenCalledTimes(1);
  });
});
