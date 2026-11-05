import {
  DevelopmentBusinessGuard,
  developmentBusinessEnabled,
} from './development-business.guard';

describe('desarrollo comercial aislado del release productivo', () => {
  it.each(['IOELOCAL', undefined])(
    'rechaza destino %s sin consultar objetos experimentales',
    (database) => {
      const config: any = {
        get: (key: string) => (key === 'DB_NAME' ? database : 'production'),
      };
      expect(developmentBusinessEnabled(config)).toBe(false);
      expect(() => new DevelopmentBusinessGuard(config).canActivate()).toThrow(
        'únicamente en desarrollo',
      );
    },
  );
  it('conserva función en IOEDESARROLLO de desarrollo', () => {
    const config: any = {
      get: (key: string) =>
        key === 'DB_NAME' ? 'IOEDESARROLLO' : 'development',
    };
    expect(new DevelopmentBusinessGuard(config).canActivate()).toBe(true);
  });
});
