SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

BEGIN TRAN;

DECLARE @lock int;
EXEC @lock=sys.sp_getapplock
  @Resource='DAT_REC_REVERTIR_RECHAZO_70000288005',
  @LockMode='Exclusive',
  @LockOwner='Transaction',
  @LockTimeout=15000;
IF @lock<0
  THROW 51000,'No fue posible bloquear la reversión del rechazo.',1;

DECLARE @docrec nvarchar(510)=N'70000288005';
DECLARE @nped nvarchar(510)=N'450002329';

IF NOT EXISTS(
  SELECT 1
  FROM dbo.REC_CTRL_DOC_REC
  WHERE DOCREC=@docrec
    AND NPED=@nped
    AND ESTATUS_REC='RECHAZADO'
    AND TIPO_RECEPCION='RECHAZO'
)
  THROW 51000,'La recepción ya no corresponde al rechazo esperado.',1;

IF (SELECT COUNT(*) FROM dbo.REC_CTO_HIST WHERE DOCREC=@docrec)<>3
  THROW 51000,'El rechazo ya no contiene los tres renglones verificados.',1;

IF EXISTS(
  SELECT 1
  FROM dbo.DAT_MB51 m
  WHERE CONVERT(nvarchar(510),m.DOCP)=@docrec
     OR EXISTS(
       SELECT 1
       FROM dbo.REC_CTO_HIST h
       WHERE h.DOCREC=@docrec AND h.IDREC=m.IDPD
     )
)
  THROW 51000,'El rechazo tiene movimientos MB51 y no puede revertirse con este script.',1;

IF EXISTS(
  SELECT 1 FROM dbo.DAT_CTR_DOC
  WHERE CONVERT(nvarchar(510),DOC)=@docrec
)
  THROW 51000,'El rechazo tiene documento contable y no puede revertirse.',1;

IF EXISTS(
  SELECT 1
  FROM dbo.REC_DET_PED
  WHERE NPED=@nped
    AND (ISNULL(CTDREC,0)<>0 OR DREC IS NOT NULL OR ISNULL(RECI,0)<>0)
)
  THROW 51000,'La O.C. tiene cantidades recibidas o referencias activas.',1;

DELETE dbo.REC_GUIA_PED WHERE DOCREC=@docrec;
DELETE dbo.REC_INCI_PED WHERE DOCREC=@docrec;
DELETE dbo.AUDIT_LOG
WHERE MODULO='DAT_REC'
  AND ENTIDAD='REC_CTRL_DOC_REC'
  AND ENTIDAD_ID=@docrec;
DELETE dbo.REC_CTO_HIST WHERE DOCREC=@docrec;
DELETE dbo.REC_CTRL_DOC_REC WHERE DOCREC=@docrec AND NPED=@nped;

UPDATE dbo.REC_CAB_PED
SET ESTATUS='PROCESADO',FCNR=NULL
WHERE NPED=@nped;

COMMIT;

SELECT @docrec DOCREC_REVERTIDO,@nped NPED,CAST('PROCESADO' AS varchar(20)) ESTATUS_OC;
GO
