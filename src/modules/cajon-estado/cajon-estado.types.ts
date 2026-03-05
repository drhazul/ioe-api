export type CajonEstadoScope = 'CAJON_ESTADO';

export type CajonEstadoAuthSession = {
  token: string;
  scope: CajonEstadoScope;
  supervisorUserId: number;
  requestedByUserId: number;
  issuedAtMs: number;
};

export type CajonEstadoResumenRow = {
  OPV: string;
  FORM: string;
  NOM: string;
  IMPT: number;
  IMPR: number;
  IMPE: number | null;
  DIFD: number;
};
