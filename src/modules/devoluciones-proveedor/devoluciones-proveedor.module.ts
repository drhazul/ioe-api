import { Module } from '@nestjs/common';
import { DevolucionesProveedorController } from './devoluciones-proveedor.controller';
import { DevolucionesProveedorService } from './devoluciones-proveedor.service';

@Module({
  controllers: [DevolucionesProveedorController],
  providers: [DevolucionesProveedorService],
  exports: [DevolucionesProveedorService],
})
export class DevolucionesProveedorModule {}
