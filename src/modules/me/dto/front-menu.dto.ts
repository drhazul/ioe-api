export type FrontMenuItemDto = {
  id: number;
  codigo: string;
  nombre: string;
  depto: string | null;
  activo: boolean;
};

export type FrontMenuGroupDto = {
  id: number;
  nombre: string;
  items: FrontMenuItemDto[];
};

export type FrontMenuResponseDto = {
  roleId: number;
  accesoTotal: boolean;
  grupos: FrontMenuGroupDto[];
};
