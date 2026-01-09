export type RoleDatModuloDto = {
  codigo: string;
  nombre: string;
  depto: string | null;
  activo: boolean;
};

export type RoleDatmodulosResponseDto = {
  roleId: number;
  accesoTotal: boolean;
  modulos: RoleDatModuloDto[];
};
