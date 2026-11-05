/*
  Completa datos candidatos de ID_ENTIDAD_FISCAL=1 solo en IOEDESARROLLO.
  Fuentes: FACT_CSD (nombre, régimen, CP) y DAT_SUC (domicilio de sucursal
  vinculada con el mismo RFC). No valida identidad, no cambia relaciones,
  no marca VALIDADA y no lee CER, LLAVE ni credenciales PAC.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

DECLARE @ServidorEsperado nvarchar(128)=N'dd7842d7ba7e';
DECLARE @BaseEsperada sysname=N'IOEDESARROLLO';
DECLARE @IdEntidad int=1;

IF LOWER(CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')))<>LOWER(@ServidorEsperado)
  THROW 51001, 'Servidor distinto del autorizado para este cambio.', 1;
IF DB_NAME()<>@BaseEsperada
  THROW 51002, 'Base distinta de IOEDESARROLLO.', 1;
IF CONVERT(nvarchar(20),DATABASEPROPERTYEX(DB_NAME(),'Updateability'))<>N'READ_WRITE'
  THROW 51003, 'IOEDESARROLLO no está en modo READ_WRITE.', 1;
IF NOT EXISTS(SELECT 1 FROM sys.databases WHERE name=DB_NAME() AND state_desc='ONLINE')
  THROW 51004, 'Base no está ONLINE.', 1;

BEGIN TRY
  BEGIN TRANSACTION;

  DECLARE @Rfc nvarchar(20),
          @Estado varchar(12),
          @NombreActual nvarchar(300),
          @RegimenActual varchar(3),
          @CpActual char(5),
          @DomicilioActual nvarchar(500),
          @ReferenciaActual nvarchar(250),
          @ValidadoPorActual nvarchar(255),
          @FValidacionActual datetime2(7),
          @VersionAntes binary(8),
          @NombreFuente nvarchar(300),
          @RegimenFuente varchar(3),
          @CpFuente char(5),
          @DomicilioFuente nvarchar(500),
          @IdCsd int,
          @CuentaCsd int=0,
          @CuentaVinculos int=0,
          @RfcSucursalDistinto int=0,
          @DireccionDistinta int=0,
          @IdEmpresa int,
          @EmpresaDistinta int=0,
          @SucursalDireccion nvarchar(10),
          @CuentaEmpresa int=0,
          @VersionDespues binary(8),
          @IdAudit bigint=NULL,
          @Cambio bit=0;

  SELECT @Rfc=RFC,
         @Estado=ESTADO_VALIDACION,
         @NombreActual=NOMBRE_LEGAL,
         @RegimenActual=REGIMEN_FISCAL,
         @CpActual=CP_FISCAL,
         @DomicilioActual=DOMICILIO_FISCAL,
         @ReferenciaActual=REFERENCIA_VALIDACION,
         @ValidadoPorActual=VALIDADO_POR,
         @FValidacionActual=FCN_VALIDACION_UTC,
         @VersionAntes=VERSION
  FROM dbo.ENTIDAD_FISCAL WITH(UPDLOCK,HOLDLOCK)
  WHERE ID_ENTIDAD_FISCAL=@IdEntidad;

  IF @Rfc IS NULL THROW 51005, 'No existe ID_ENTIDAD_FISCAL=1.', 1;
  IF @Estado<>'PENDIENTE' THROW 51006, 'La entidad ya no está PENDIENTE.', 1;

  SELECT @CuentaCsd=COUNT(*),
         @IdCsd=MAX(ID),
         @NombreFuente=MAX(NULLIF(LTRIM(RTRIM(NOMBRE)),N'')),
         @RegimenFuente=MAX(NULLIF(LTRIM(RTRIM(REGIMEN_FISCAL)),'')),
         @CpFuente=MAX(NULLIF(LTRIM(RTRIM(CODIGO_POSTAL)),''))
  FROM dbo.FACT_CSD WITH(HOLDLOCK)
  WHERE UPPER(LTRIM(RTRIM(RFC)))=UPPER(LTRIM(RTRIM(@Rfc)))
    AND ACTIVO=1
    AND VIGENCIA_DESDE<=SYSUTCDATETIME()
    AND VIGENCIA_HASTA>=SYSUTCDATETIME();

  IF @CuentaCsd<>1 OR @NombreFuente IS NULL OR @RegimenFuente IS NULL OR @CpFuente IS NULL
    THROW 51007, 'Debe existir un único CSD activo y vigente con nombre, régimen y CP.', 1;
  IF LEN(@NombreFuente)>300 OR LEN(@RegimenFuente)<>3 OR @CpFuente NOT LIKE '[0-9][0-9][0-9][0-9][0-9]'
    THROW 51008, 'Metadatos fiscales de FACT_CSD no cumplen formato.', 1;

  SELECT @CuentaVinculos=COUNT(*),
         @RfcSucursalDistinto=COALESCE(SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(s.RFC,''))))<>UPPER(LTRIM(RTRIM(@Rfc))) OR r.ESTADO_VALIDACION<>'PENDIENTE' THEN 1 ELSE 0 END),0),
         @DireccionDistinta=COUNT(DISTINCT NULLIF(LTRIM(RTRIM(s.DIRECCION)),N'')),
         @DomicilioFuente=MAX(NULLIF(LTRIM(RTRIM(s.DIRECCION)),N'')),
         @SucursalDireccion=MAX(CASE WHEN NULLIF(LTRIM(RTRIM(s.DIRECCION)),N'') IS NOT NULL THEN s.SUC END),
         @IdEmpresa=MIN(s.IDEMPRESA),
         @EmpresaDistinta=COUNT(DISTINCT s.IDEMPRESA)
  FROM dbo.ENTIDAD_FISCAL_SUCURSAL r WITH(HOLDLOCK)
  JOIN dbo.DAT_SUC s WITH(HOLDLOCK) ON s.SUC=r.SUC
  WHERE r.ID_ENTIDAD_FISCAL=@IdEntidad;

  IF @CuentaVinculos<>2 OR @RfcSucursalDistinto<>0 OR @DireccionDistinta<>1 OR @DomicilioFuente IS NULL OR @EmpresaDistinta<>1
    THROW 51009, 'Los dos vínculos y el domicilio candidato de DAT_SUC ya no cumplen preflight.', 1;
  IF LEN(@DomicilioFuente)>500
    THROW 51010, 'Domicilio candidato excede el tamaño de ENTIDAD_FISCAL.', 1;

  SELECT @CuentaEmpresa=COUNT(*)
  FROM dbo.EMPRESA WITH(HOLDLOCK)
  WHERE idempresa=@IdEmpresa;
  IF @CuentaEmpresa<>1
    THROW 51011, 'La empresa operativa vinculada no existe de forma única.', 1;

  IF NULLIF(LTRIM(RTRIM(@NombreActual)),N'') IS NOT NULL AND UPPER(LTRIM(RTRIM(@NombreActual)))<>UPPER(LTRIM(RTRIM(@NombreFuente)))
    THROW 51012, 'Nombre legal existente difiere de FACT_CSD.', 1;
  IF NULLIF(LTRIM(RTRIM(@RegimenActual)),'') IS NOT NULL AND @RegimenActual<>@RegimenFuente
    THROW 51013, 'Régimen existente difiere de FACT_CSD.', 1;
  IF NULLIF(LTRIM(RTRIM(@CpActual)),'') IS NOT NULL AND @CpActual<>@CpFuente
    THROW 51014, 'CP existente difiere de FACT_CSD.', 1;
  IF NULLIF(LTRIM(RTRIM(@DomicilioActual)),N'') IS NOT NULL AND LTRIM(RTRIM(@DomicilioActual))<>@DomicilioFuente
    THROW 51015, 'Domicilio existente difiere de DAT_SUC.', 1;

  IF NULLIF(LTRIM(RTRIM(@NombreActual)),N'') IS NULL
     OR NULLIF(LTRIM(RTRIM(@RegimenActual)),'') IS NULL
     OR NULLIF(LTRIM(RTRIM(@CpActual)),'') IS NULL
     OR NULLIF(LTRIM(RTRIM(@DomicilioActual)),N'') IS NULL
    SET @Cambio=1;

  IF @Cambio=1
  BEGIN
    UPDATE dbo.ENTIDAD_FISCAL
       SET NOMBRE_LEGAL=@NombreFuente,
           REGIMEN_FISCAL=@RegimenFuente,
           CP_FISCAL=@CpFuente,
           DOMICILIO_FISCAL=@DomicilioFuente,
           MODIFICADO_POR=N'Codex:solicitud titular',
           FCN_MODIFICACION_UTC=SYSUTCDATETIME()
     WHERE ID_ENTIDAD_FISCAL=@IdEntidad
       AND VERSION=@VersionAntes
       AND ESTADO_VALIDACION='PENDIENTE';
    IF @@ROWCOUNT<>1 THROW 51016, 'Conflicto concurrente al actualizar ID 1.', 1;

    INSERT dbo.ENTIDAD_FISCAL_AUDIT(ID_ENTIDAD_FISCAL,ID_RELACION,ACCION,CAMPOS_JSON,ACTOR)
    VALUES(@IdEntidad,NULL,'CAMBIO',
      N'{"fields":["NOMBRE_LEGAL","REGIMEN_FISCAL","CP_FISCAL","DOMICILIO_FISCAL"],"sources":{"nameRegimePostal":"dbo.FACT_CSD","address":"dbo.DAT_SUC","links":"dbo.ENTIDAD_FISCAL_SUCURSAL","operationalCompany":"dbo.EMPRESA"},"statusAfter":"PENDIENTE","officialValidation":false}',
      N'Codex:solicitud titular');
    SET @IdAudit=SCOPE_IDENTITY();
  END;

  SELECT @VersionDespues=VERSION
  FROM dbo.ENTIDAD_FISCAL WITH(HOLDLOCK)
  WHERE ID_ENTIDAD_FISCAL=@IdEntidad
    AND UPPER(LTRIM(RTRIM(NOMBRE_LEGAL)))=UPPER(LTRIM(RTRIM(@NombreFuente)))
    AND REGIMEN_FISCAL=@RegimenFuente
    AND CP_FISCAL=@CpFuente
    AND LTRIM(RTRIM(DOMICILIO_FISCAL))=@DomicilioFuente
    AND ESTADO_VALIDACION='PENDIENTE'
    AND REFERENCIA_VALIDACION IS NULL
    AND VALIDADO_POR IS NULL
    AND FCN_VALIDACION_UTC IS NULL;
  IF @VersionDespues IS NULL THROW 51017, 'Postflight de candidato o estado pendiente falló.', 1;

  IF (SELECT COUNT(*) FROM dbo.ENTIDAD_FISCAL_SUCURSAL WITH(HOLDLOCK)
      WHERE ID_ENTIDAD_FISCAL=@IdEntidad AND ESTADO_VALIDACION='PENDIENTE')<>2
    THROW 51018, 'Postflight detectó cambio en vínculos de sucursal.', 1;

  COMMIT TRANSACTION;

  SELECT N'APLICADO' AS resultado,
         @IdEntidad AS idEntidadFiscal,
         @Cambio AS actualizoCampos,
         @IdCsd AS idCsdFuente,
         @SucursalDireccion AS sucursalDireccionFuente,
         @IdEmpresa AS idEmpresaOperativa,
         sys.fn_varbintohexstr(@VersionAntes) AS versionAntes,
         sys.fn_varbintohexstr(@VersionDespues) AS versionDespues,
         @IdAudit AS idAuditoria,
         N'PENDIENTE' AS estadoEntidad,
         CAST(2 AS int) AS vinculosPendientes,
         CAST(0 AS bit) AS odooActualizado;
END TRY
BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
