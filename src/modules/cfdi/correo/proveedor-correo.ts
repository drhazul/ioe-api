export const CFDI_CORREO_PROVIDER = Symbol('CFDI_CORREO_PROVIDER');

export interface AdjuntoCorreo {
  nombre: string;
  tipo: string;
  contenido: Buffer;
}

export interface MensajeCorreo {
  para: string;
  desde: string;
  nombreRemitente: string;
  asunto: string;
  texto: string;
  adjuntos?: AdjuntoCorreo[];
}

/** Contrato de transporte; permite sumar Graph/SMTP sin cambiar outbox ni emisión. */
export interface ProveedorCorreo {
  enviar(mensaje: MensajeCorreo): Promise<string>;
}
