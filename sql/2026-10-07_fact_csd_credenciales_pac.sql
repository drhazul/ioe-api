/*
  Credenciales de Quadrum por razon social.

  Por que: cada RFC emisor timbra con su propia cuenta del PAC, no con una
  sola del .env. Las credenciales van pegadas al certificado porque son del
  mismo contrato: el CSD y la cuenta pertenecen a la misma razon social.

  La contrasena se guarda cifrada con la misma llave que la del .key
  (CSD_CIFRADO_LLAVE del .env), nunca en claro.

  Ambas admiten nulos: el certificado de pruebas no tiene cuenta propia y
  sigue usando la del .env.
*/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

IF COL_LENGTH('dbo.FACT_CSD', 'QUADRUM_USUARIO') IS NULL
BEGIN
  ALTER TABLE dbo.FACT_CSD ADD QUADRUM_USUARIO NVARCHAR(100) NULL;
END;
GO

IF COL_LENGTH('dbo.FACT_CSD', 'QUADRUM_PASSWORD_CIFRADA') IS NULL
BEGIN
  ALTER TABLE dbo.FACT_CSD ADD QUADRUM_PASSWORD_CIFRADA NVARCHAR(500) NULL;
END;
GO
