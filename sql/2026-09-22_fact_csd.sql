/*
  FACT_CSD — custodia de los CSD (certificados de sello digital) por RFC emisor.

  Por que existe: al timbrar con Quadrum el sellado ocurre de nuestro lado, y
  cada razon social factura con SU propio certificado. Hoy en FAC_SVR_SHAP hay
  3 RFC emisores distintos (personas fisicas), asi que un solo CSD en el .env
  no alcanza.

  Que guarda y que NO:
    - CER y LLAVE: los archivos .cer y .key tal cual, en binario.
    - PASSWORD_CIFRADA: la contrasena del .key cifrada con AES-256-GCM. La
      llave del cifrado vive en CSD_CIFRADO_LLAVE (.env), NUNCA en la base:
      quien lea esta tabla sin esa llave no puede usar los certificados.
    - REGIMEN_FISCAL y CODIGO_POSTAL: el certificado no los trae y el CFDI los
      exige, por eso se capturan al subirlo.

  Historial: la llave primaria es (RFC, NO_CERTIFICADO), asi que al renovar un
  CSD el anterior se conserva con ACTIVO = 0. El indice filtrado garantiza un
  solo certificado activo por RFC.

  SEGURIDAD: restringir permisos de esta tabla al usuario de la API.
  Quien pueda leer CER + LLAVE + la llave de cifrado puede facturar a nombre
  de esas razones sociales.
*/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

IF OBJECT_ID('dbo.FACT_CSD', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.FACT_CSD (
    ID BIGINT IDENTITY(1,1) NOT NULL,
    RFC NVARCHAR(13) NOT NULL,
    NOMBRE NVARCHAR(255) NULL,
    NO_CERTIFICADO NVARCHAR(20) NOT NULL,
    REGIMEN_FISCAL NVARCHAR(3) NOT NULL,
    CODIGO_POSTAL NVARCHAR(5) NOT NULL,
    CER VARBINARY(MAX) NOT NULL,
    LLAVE VARBINARY(MAX) NOT NULL,
    PASSWORD_CIFRADA NVARCHAR(MAX) NOT NULL,
    VIGENCIA_DESDE DATETIME2 NOT NULL,
    VIGENCIA_HASTA DATETIME2 NOT NULL,
    ACTIVO BIT NOT NULL
      CONSTRAINT DF_FACT_CSD_ACTIVO DEFAULT (1),
    FCN_ALTA DATETIME2 NOT NULL
      CONSTRAINT DF_FACT_CSD_FCN_ALTA DEFAULT (SYSDATETIME()),
    USUARIO_ALTA NVARCHAR(120) NULL,
    CONSTRAINT PK_FACT_CSD PRIMARY KEY CLUSTERED (ID)
  );
END;
GO

-- Un mismo certificado no se puede cargar dos veces para el mismo RFC.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.FACT_CSD')
    AND name = 'UX_FACT_CSD_RFC_CERT'
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UX_FACT_CSD_RFC_CERT
    ON dbo.FACT_CSD (RFC, NO_CERTIFICADO);
END;
GO

-- Un solo certificado ACTIVO por RFC: lo garantiza la base, no el codigo.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.FACT_CSD')
    AND name = 'UX_FACT_CSD_ACTIVO_POR_RFC'
)
BEGIN
  CREATE UNIQUE NONCLUSTERED INDEX UX_FACT_CSD_ACTIVO_POR_RFC
    ON dbo.FACT_CSD (RFC)
    WHERE ACTIVO = 1;
END;
GO
