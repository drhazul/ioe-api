export type BackendPermRowDto = {
  idGrupModulo: number;
  grupNombre: string | null;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  accesoTotal: boolean;
};

export type BackendPermsResponseDto = {
  roleId: number;
  accesoTotal: boolean;
  permisos: BackendPermRowDto[];
};
