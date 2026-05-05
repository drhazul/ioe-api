import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

export type PunchRealtimePayload = {
  idTimeLog: number | null;
  idUsuario: number | null;
  suc: string | null;
  tipo: string | null;
  punchTime: string | null;
  terminalId: string | null;
  eventPhoto: string | null;
  expedientePhoto: string | null;
  bodyTemp: number | null;
  verifyMode: number | null;
  verifyModeLabel: string | null;
  isOffline: boolean;
  requiresReview: boolean;
  silentAlert: boolean;
  source: 'ADMS_PUSH' | 'USB_IMPORT' | 'KIOSCO_VISITA' | 'SELF_SERVICE';
};

@Injectable()
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class MarcajesRealtimeGateway
  implements OnGatewayInit<Server>, OnGatewayConnection
{
  @WebSocketServer()
  server: Server | undefined;

  private readonly logger = new Logger(MarcajesRealtimeGateway.name);

  afterInit(server: Server) {
    this.server = server;
    this.logger.log('Socket realtime listo en namespace /realtime');
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Socket conectado: ${client.id}`);
  }

  emitNewPunch(payload: PunchRealtimePayload) {
    this.server?.emit('new_punch', payload);
  }

  emitSilentAlert(payload: PunchRealtimePayload & { reason: string }) {
    this.server?.emit('silent_alert', payload);
  }

  emitTemplateUpdated(payload: {
    colaboradorId: number;
    pin: string;
    tipo: string;
    updatedAt: string;
  }) {
    this.server?.emit('template_updated', payload);
  }
}
