IF OBJECT_ID('dbo.EMPRESA', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.EMPRESA (
    idempresa INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EMPRESA PRIMARY KEY,
    razon_social NVARCHAR(200) NOT NULL,
    direccion NVARCHAR(300) NULL,
    correo NVARCHAR(120) NOT NULL,
    fcncreacion DATETIME2(0) NOT NULL CONSTRAINT DF_EMPRESA_fcncreacion DEFAULT SYSDATETIME(),
    cp NVARCHAR(10) NULL,
    rfc NVARCHAR(20) NULL,
    telefono NVARCHAR(30) NULL,
    CONSTRAINT UQ_EMPRESA_correo UNIQUE (correo),
    CONSTRAINT CK_EMPRESA_correo_prefijo CHECK (
      correo LIKE '@%.%'
      AND correo NOT LIKE '% %'
      AND LEFT(correo, 1) = '@'
      AND CHARINDEX('@', correo, 2) = 0
    )
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM dbo.EMPRESA
  WHERE LOWER(LTRIM(RTRIM(correo))) = '@ioebusiness.com.mx'
)
BEGIN
  INSERT INTO dbo.EMPRESA (
    razon_social,
    direccion,
    correo,
    cp,
    rfc,
    telefono
  )
  VALUES (
    'IOE BUSINESS',
    NULL,
    '@ioebusiness.com.mx',
    NULL,
    NULL,
    NULL
  );
END;
