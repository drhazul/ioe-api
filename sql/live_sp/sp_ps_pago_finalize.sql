
                                                                                                                                                                                                                                                             
CREATE   PROCEDURE dbo.sp_ps_pago_finalize
                                                                                                                                                                                                                   
  @IDFOL NVARCHAR(255),
                                                                                                                                                                                                                                      
  @FORMAS_JSON NVARCHAR(MAX),
                                                                                                                                                                                                                                
  @USER NVARCHAR(255) = NULL
                                                                                                                                                                                                                                 
AS
                                                                                                                                                                                                                                                           
BEGIN
                                                                                                                                                                                                                                                        
  SET NOCOUNT ON;
                                                                                                                                                                                                                                            
  SET XACT_ABORT ON;
                                                                                                                                                                                                                                         

                                                                                                                                                                                                                                                             
  DECLARE @startedTran BIT = 0;
                                                                                                                                                                                                                              
  DECLARE @idfolNorm NVARCHAR(255) = LTRIM(RTRIM(ISNULL(@IDFOL, '')));
                                                                                                                                                                                       
  DECLARE @idfolActual NVARCHAR(255);
                                                                                                                                                                                                                        
  DECLARE @idfolInicial NVARCHAR(255);
                                                                                                                                                                                                                       
  DECLARE @idfolVisibleNuevo NVARCHAR(255);
                                                                                                                                                                                                                  
  DECLARE @folioConsecNuevo INT = NULL;
                                                                                                                                                                                                                      
  DECLARE @traActual NVARCHAR(255);
                                                                                                                                                                                                                          
  DECLARE @traVisibleNuevo NVARCHAR(255);
                                                                                                                                                                                                                    
  DECLARE @origenAut VARCHAR(2);
                                                                                                                                                                                                                             
  DECLARE @tipoVisibleFinal VARCHAR(2);
                                                                                                                                                                                                                      
  DECLARE @folioActualUpper NVARCHAR(255);
                                                                                                                                                                                                                   
  DECLARE @formasJsonNorm NVARCHAR(MAX) = LTRIM(RTRIM(ISNULL(@FORMAS_JSON, '')));
                                                                                                                                                                            
  DECLARE @userNorm NVARCHAR(255) = NULLIF(LTRIM(RTRIM(ISNULL(@USER, ''))), '');
                                                                                                                                                                             
  DECLARE @fechaProceso DATETIME = GETDATE();
                                                                                                                                                                                                                
  DECLARE @fechaProcesoDate DATE = CONVERT(DATE, GETDATE());
                                                                                                                                                                                                 
  DECLARE @sucDb NVARCHAR(20);
                                                                                                                                                                                                                               
  DECLARE @opvDb NVARCHAR(255);
                                                                                                                                                                                                                              
  DECLARE @clien FLOAT;
                                                                                                                                                                                                                                      
  DECLARE @estado NVARCHAR(40);
                                                                                                                                                                                                                              
  DECLARE @serviceType CHAR(2);
                                                                                                                                                                                                                              
  DECLARE @isCashOut BIT = 0;
                                                                                                                                                                                                                                
  DECLARE @total DECIMAL(18, 4);
                                                                                                                                                                                                                             
  DECLARE @sumPagos DECIMAL(18, 4);
                                                                                                                                                                                                                          
  DECLARE @cambio DECIMAL(18, 4) = 0;
                                                                                                                                                                                                                        
  DECLARE @cambioPendiente DECIMAL(18, 4) = 0;
                                                                                                                                                                                                               
  DECLARE @epsilon DECIMAL(18, 6) = 0.0001;
                                                                                                                                                                                                                  
  DECLARE @efectivoCambioAsignado BIT = 0;
                                                                                                                                                                                                                   
  DECLARE @folFormTable NVARCHAR(128) = NULL;
                                                                                                                                                                                                                
  DECLARE @folFormObjId INT = NULL;
                                                                                                                                                                                                                          
  DECLARE @hasIDF BIT = 0;
                                                                                                                                                                                                                                   
  DECLARE @idfIsIdentity BIT = 0;
                                                                                                                                                                                                                            
  DECLARE @hasFCN BIT = 0;
                                                                                                                                                                                                                                   
  DECLARE @hasIMPA BIT = 0;
                                                                                                                                                                                                                                  
  DECLARE @hasIMPC BIT = 0;
                                                                                                                                                                                                                                  
  DECLARE @hasIMPD BIT = 0;
                                                                                                                                                                                                                                  
  DECLARE @hasAUT BIT = 0;
                                                                                                                                                                                                                                   
  DECLARE @hasESTA BIT = 0;
                                                                                                                                                                                                                                  
  DECLARE @hasESTAF BIT = 0;
                                                                                                                                                                                                                                 
  DECLARE @sql NVARCHAR(MAX);
                                                                                                                                                                                                                                
  DECLARE @execIdf NVARCHAR(255);
                                                                                                                                                                                                                            
  DECLARE @formaForm NVARCHAR(40);
                                                                                                                                                                                                                           
  DECLARE @formaImpp DECIMAL(18, 4);
                                                                                                                                                                                                                         
  DECLARE @formaAut NVARCHAR(255);
                                                                                                                                                                                                                           
  DECLARE @impc DECIMAL(18, 4);
  DECLARE @impd DECIMAL(18, 4);
                                                                                                                                                                                                                              
  DECLARE @ctrlObjId INT = NULL;
                                                                                                                                                                                                                             
  DECLARE @ctrlHasCTA BIT = 0;
                                                                                                                                                                                                                               
  DECLARE @ctrlHasCLIENT BIT = 0;
                                                                                                                                                                                                                            
  DECLARE @ctrlHasCMOV BIT = 0;
                                                                                                                                                                                                                              
  DECLARE @ctrlHasCLSD BIT = 0;
                                                                                                                                                                                                                              
  DECLARE @ctrlHasIMPT BIT = 0;
                                                                                                                                                                                                                              
  DECLARE @ctrlHasNDOC BIT = 0;
                                                                                                                                                                                                                              
  DECLARE @ctrlHasIDFOL BIT = 0;
                                                                                                                                                                                                                             
  DECLARE @ctrlHasSUC BIT = 0;
                                                                                                                                                                                                                               
  DECLARE @ctrlHasOPV BIT = 0;
                                                                                                                                                                                                                               
  DECLARE @ctrlHasIDOPV BIT = 0;
                                                                                                                                                                                                                             
  DECLARE @ctrlHasTIPO BIT = 0;
                                                                                                                                                                                                                              
  DECLARE @ctrlHasRTXT BIT = 0;
                                                                                                                                                                                                                              
  DECLARE @ctrlHasFCND BIT = 0;
                                                                                                                                                                                                                              
  DECLARE @ctrlHasFCN BIT = 0;
                                                                                                                                                                                                                               
  DECLARE @ctrlHasFCNR BIT = 0;
                                                                                                                                                                                                                              
  DECLARE @ctrlHasFECHA BIT = 0;
                                                                                                                                                                                                                             
  DECLARE @ctrlClassCol NVARCHAR(10) = NULL;
                                                                                                                                                                                                                 
  DECLARE @datCmovObjId INT = OBJECT_ID('dbo.DAT_CMOV');
                                                                                                                                                                                                     
  DECLARE @datCmovHasRelacion BIT = 0;
                                                                                                                                                                                                                       
  DECLARE @datCmovHasCmov BIT = 0;
                                                                                                                                                                                                                           
  DECLARE @datCmovHasTipo BIT = 0;
                                                                                                                                                                                                                           
  DECLARE @lineTipps NVARCHAR(10);
                                                                                                                                                                                                                           
  DECLARE @lineOrd NVARCHAR(255);
                                                                                                                                                                                                                            
  DECLARE @lineTotal DECIMAL(18, 4);
                                                                                                                                                                                                                         
  DECLARE @movClass INT;
                                                                                                                                                                                                                                     
  DECLARE @cta NVARCHAR(255);
                                                                                                                                                                                                                                
  DECLARE @lineImpt DECIMAL(18, 4);
                                                                                                                                                                                                                          
  DECLARE @lineIdFol NVARCHAR(255);
                                                                                                                                                                                                                          
  DECLARE @rtxt NVARCHAR(255);
                                                                                                                                                                                                                               
  DECLARE @ndoc NVARCHAR(255);
                                                                                                                                                                                                                               
  DECLARE @opvAudit NVARCHAR(255);
                                                                                                                                                                                                                           
  DECLARE @movErr NVARCHAR(255);
                                                                                                                                                                                                                             

                                                                                                                                                                                                                                                             
  DECLARE @FORMAS TABLE (
                                                                                                                                                                                                                                    
    ROW_ID INT IDENTITY(1,1) PRIMARY KEY,
                                                                                                                                                                                                                    
    FORM NVARCHAR(40) NOT NULL,
                                                                                                                                                                                                                              
    IMPP DECIMAL(18,4) NOT NULL,
                                                                                                                                                                                                                             
    AUT NVARCHAR(255) NULL
                                                                                                                                                                                                                                   
  );
                                                                                                                                                                                                                                                         

                                                                                                                                                                                                                                                             
  DECLARE @LINES TABLE (
                                                                                                                                                                                                                                     
    ROW_ID INT IDENTITY(1,1) PRIMARY KEY,
                                                                                                                                                                                                                    
    UPC NVARCHAR(10) NOT NULL,
                                                                                                                                                                                                                               
    ORD NVARCHAR(255) NULL,
                                                                                                                                                                                                                                  
    LINE_TOTAL DECIMAL(18,4) NOT NULL
                                                                                                                                                                                                                        
  );
                                                                                                                                                                                                                                                         

                                                                                                                                                                                                                                                             
  IF @idfolNorm = ''
                                                                                                                                                                                                                                         
    THROW 57120, 'IDFOL es requerido', 1;
                                                                                                                                                                                                                    

                                                                                                                                                                                                                                                             
  IF @formasJsonNorm = ''
                                                                                                                                                                                                                                    
    THROW 57121, 'FORMAS_JSON es requerido', 1;
                                                                                                                                                                                                              

                                                                                                                                                                                                                                                             
  INSERT INTO @FORMAS (FORM, IMPP, AUT)
                                                                                                                                                                                                                      
  SELECT
                                                                                                                                                                                                                                                     
    UPPER(LTRIM(RTRIM(ISNULL(j.FORM, '')))) AS FORM,
                                                                                                                                                                                                         
    TRY_CONVERT(DECIMAL(18,4), j.IMPP) AS IMPP,
                                                                                                                                                                                                              
    NULLIF(LTRIM(RTRIM(ISNULL(j.AUT, ''))), '') AS AUT
                                                                                                                                                                                                       
  FROM OPENJSON(@formasJsonNorm)
                                                                                                                                                                                                                             
  WITH (
                                                                                                                                                                                                                                                     
    FORM NVARCHAR(40) '$.form',
                                                                                                                                                                                                                              
    IMPP NVARCHAR(64) '$.impp',
                                                                                                                                                                                                                              
    AUT NVARCHAR(255) '$.aut'
                                                                                                                                                                                                                                
  ) j;
                                                                                                                                                                                                                                                       

                                                                                                                                                                                                                                                             
  IF NOT EXISTS (SELECT 1 FROM @FORMAS)
                                                                                                                                                                                                                      
    THROW 57122, 'Debe enviar al menos una forma de pago', 1;
                                                                                                                                                                                                

                                                                                                                                                                                                                                                             
  IF EXISTS (
                                                                                                                                                                                                                                                
    SELECT 1
                                                                                                                                                                                                                                                 
    FROM @FORMAS
                                                                                                                                                                                                                                             
    WHERE FORM = ''
                                                                                                                                                                                                                                          
      OR IMPP IS NULL
                                                                                                                                                                                                                                        
      OR IMPP <= 0
                                                                                                                                                                                                                                           
  )
                                                                                                                                                                                                                                                          
    THROW 57123, 'Las formas enviadas no son vÃ¡lidas', 1;
                                                                                                                                                                                                   

                                                                                                                                                                                                                                                             
  IF EXISTS (
                                                                                                                                                                                                                                                
    SELECT 1
                                                                                                                                                                                                                                                 
    FROM @FORMAS
                                                                                                                                                                                                                                             
    WHERE FORM IN ('TARJETA', 'CHEQUE', 'TRANSFERENCIA', 'DEPOSITO 3RO')
                                                                                                                                                                                     
      AND (AUT IS NULL OR AUT = '')
                                                                                                                                                                                                                          
  )
                                                                                                                                                                                                                                                          
    THROW 57124, 'Las formas no efectivo requieren autorizaciÃ³n/referencia', 1;
                                                                                                                                                                             

                                                                                                                                                                                                                                                             
  BEGIN TRY
                                                                                                                                                                                                                                                  
    IF @@TRANCOUNT = 0
                                                                                                                                                                                                                                       
    BEGIN
                                                                                                                                                                                                                                                    
      SET @startedTran = 1;
                                                                                                                                                                                                                                  
      BEGIN TRANSACTION;
                                                                                                                                                                                                                                     
    END;
                                                                                                                                                                                                                                                     

                                                                                                                                                                                                                                                             
    SELECT TOP 1
                                                                                                                                                                                                                                             
      @idfolActual = LTRIM(RTRIM(ISNULL(IDFOL, ''))),
                                                                                                                                                                                                        
      @idfolInicial = ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(IDFOLINICIAL, ''))), ''), LTRIM(RTRIM(ISNULL(IDFOL, '')))),
                                                                                                                                           
      @traActual = LTRIM(RTRIM(ISNULL(TRA, ''))),
                                                                                                                                                                                                            
      @origenAut = CASE
                                                                                                                                                                                                                                      
        WHEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, '')))) IN ('CA', 'VF')
                                                                                                                                                                                     
          THEN UPPER(LTRIM(RTRIM(ISNULL(ORIGEN_AUT, ''))))
                                                                                                                                                                                                   
        WHEN UPPER(LTRIM(RTRIM(ISNULL(AUT, '')))) IN ('DVF', 'VF')
                                                                                                                                                                                           
          THEN 'VF'
                                                                                                                                                                                                                                          
        ELSE 'CA'
                                                                                                                                                                                                                                            
      END,
                                                                                                                                                                                                                                                   
      @sucDb = LTRIM(RTRIM(ISNULL(SUC, ''))),
                                                                                                                                                                                                                
      @opvDb = LTRIM(RTRIM(ISNULL(OPV, ''))),
                                                                                                                                                                                                                
      @clien = TRY_CONVERT(FLOAT, CLIEN),
                                                                                                                                                                                                                    
      @estado = UPPER(LTRIM(RTRIM(ISNULL(ESTA, ''))))
                                                                                                                                                                                                        
    FROM dbo.PV_CTR_FOL_ASVR WITH (UPDLOCK, HOLDLOCK)
                                                                                                                                                                                                        
    WHERE IDFOL = @idfolNorm
                                                                                                                                                                                                                                 
       OR IDFOLINICIAL = @idfolNorm
                                                                                                                                                                                                                          
    ORDER BY CASE WHEN IDFOL = @idfolNorm THEN 0 ELSE 1 END, FCN DESC, FCNM DESC;
                                                                                                                                                                            

                                                                                                                                                                                                                                                             
    IF ISNULL(@idfolActual, '') = ''
                                                                                                                                                                                                                         
      THROW 57125, 'El folio PS no existe', 1;
                                                                                                                                                                                                               

                                                                                                                                                                                                                                                             
    SET @idfolNorm = @idfolActual;
                                                                                                                                                                                                                           
    IF ISNULL(@idfolInicial, '') = ''
                                                                                                                                                                                                                        
      SET @idfolInicial = @idfolActual;
                                                                                                                                                                                                                      
    SET @tipoVisibleFinal = CASE WHEN UPPER(ISNULL(@origenAut, 'CA')) = 'VF' THEN 'VF' ELSE 'CA' END;
                                                                                                                                                        
    SET @folioActualUpper = UPPER(@idfolActual);
                                                                                                                                                                                                             
    SET @idfolVisibleNuevo = @idfolActual;
                                                                                                                                                                                                                   
    SET @traVisibleNuevo = NULLIF(@traActual, '');
                                                                                                                                                                                                           

                                                                                                                                                                                                                                                             
    IF CHARINDEX('-' + @tipoVisibleFinal + '-', @folioActualUpper) = 0
                                                                                                                                                                                       
    BEGIN
                                                                                                                                                                                                                                                    
      EXEC dbo.sp_pv_next_visible_folio
                                                                                                                                                                                                                      
        @SUC = @sucDb,
                                                                                                                                                                                                                                       
        @TIPO_FOLIO = @tipoVisibleFinal,
                                                                                                                                                                                                                     
        @FECHA = @fechaProcesoDate,
                                                                                                                                                                                                                          
        @IDFOL_OUT = @idfolVisibleNuevo OUTPUT,
                                                                                                                                                                                                              
        @CONSEC_OUT = @folioConsecNuevo OUTPUT;
                                                                                                                                                                                                              

                                                                                                                                                                                                                                                             
      IF ISNULL(LTRIM(RTRIM(@idfolVisibleNuevo)), '') = ''
                                                                                                                                                                                                   
        THROW 57135, 'No se pudo generar folio visible final para PS', 1;
                                                                                                                                                                                    

                                                                                                                                                                                                                                                             
      SET @traVisibleNuevo = CONVERT(NVARCHAR(255), @folioConsecNuevo);
                                                                                                                                                                                      
    END;
                                                                                                                                                                                                                                                     

                                                                                                                                                                                                                                                             
    IF @estado = 'PAGADO'
                                                                                                                                                                                                                                    
      THROW 57126, 'El folio ya se encuentra en estado PAGADO', 1;
                                                                                                                                                                                           

                                                                                                                                                                                                                                                             
    IF NOT EXISTS (SELECT 1 FROM dbo.PV_TICKET_LOG WHERE IDFOL = @idfolNorm)
                                                                                                                                                                                 
      THROW 57127, 'El ticket no contiene renglones', 1;
                                                                                                                                                                                                     

                                                                                                                                                                                                                                                             
    IF EXISTS (
                                                                                                                                                                                                                                              
      SELECT 1
                                                                                                                                                                                                                                               
      FROM dbo.PV_TICKET_LOG
                                                                                                                                                                                                                                 
      WHERE IDFOL = @idfolNorm
                                                                                                                                                                                                                               
        AND (LTRIM(RTRIM(ISNULL(ORD, ''))) = '' OR TRY_CONVERT(DECIMAL(18,4), PVTA) IS NULL)
                                                                                                                                                                 
    )
                                                                                                                                                                                                                                                        
      THROW 57128, 'Todas las lÃ­neas del ticket deben tener referencia y PVTA capturado', 1;
                                                                                                                                                                

                                                                                                                                                                                                                                                             
    SELECT TOP 1 @serviceType = UPPER(LTRIM(RTRIM(ISNULL(UPC, ''))))
                                                                                                                                                                                         
    FROM dbo.PV_TICKET_LOG
                                                                                                                                                                                                                                   
    WHERE IDFOL = @idfolNorm;
                                                                                                                                                                                                                                

                                                                                                                                                                                                                                                             
    IF @serviceType IN ('DG', 'DC')
                                                                                                                                                                                                                          
      SET @isCashOut = 1;
                                                                                                                                                                                                                                    

                                                                                                                                                                                                                                                             
    SELECT @total = ROUND(SUM(
                                                                                                                                                                                                                               
      ISNULL(TRY_CONVERT(DECIMAL(18,4), PVTA), 0) *
                                                                                                                                                                                                          
      ISNULL(NULLIF(TRY_CONVERT(DECIMAL(18,4), CTD), 0), 1)
                                                                                                                                                                                                  
    ), 4)
                                                                                                                                                                                                                                                    
    FROM dbo.PV_TICKET_LOG
                                                                                                                                                                                                                                   
    WHERE IDFOL = @idfolNorm;
                                                                                                                                                                                                                                

                                                                                                                                                                                                                                                             
    IF @total IS NULL OR @total <= 0
                                                                                                                                                                                                                         
      THROW 57129, 'El total del ticket no es vÃ¡lido', 1;
                                                                                                                                                                                                   

                                                                                                                                                                                                                                                             
    SELECT @sumPagos = ROUND(SUM(IMPP), 4)
                                                                                                                                                                                                                   
    FROM @FORMAS;
                                                                                                                                                                                                                                            

                                                                                                                                                                                                                                                             
    IF @sumPagos IS NULL OR @sumPagos <= 0
                                                                                                                                                                                                                   
      THROW 57130, 'El total de formas de pago no es vÃ¡lido', 1;
                                                                                                                                                                                            

                                                                                                                                                                                                                                                             
    IF @sumPagos + @epsilon < @total
                                                                                                                                                                                                                         
      THROW 57131, 'El importe de formas no cubre el total del ticket', 1;
                                                                                                                                                                                   

                                                                                                                                                                                                                                                             
    IF @sumPagos > @total + @epsilon
                                                                                                                                                                                                                         
       AND NOT EXISTS (SELECT 1 FROM @FORMAS WHERE FORM = 'EFECTIVO')
                                                                                                                                                                                        
      THROW 57132, 'Solo EFECTIVO puede exceder el total para generar cambio', 1;
                                                                                                                                                                            

                                                                                                                                                                                                                                                             
    IF OBJECT_ID('dbo.PV_CTR_FOL_FORM', 'U') IS NOT NULL
                                                                                                                                                                                                     
      SET @folFormTable = N'dbo.PV_CTR_FOL_FORM';
                                                                                                                                                                                                            
    ELSE IF OBJECT_ID('dbo.PV_CTR_FOL_FORM_SVR', 'U') IS NOT NULL
                                                                                                                                                                                            
      SET @folFormTable = N'dbo.PV_CTR_FOL_FORM_SVR';
                                                                                                                                                                                                        
    ELSE
                                                                                                                                                                                                                                                     
      THROW 57133, 'No existe tabla de formas de pago (PV_CTR_FOL_FORM/PV_CTR_FOL_FORM_SVR)', 1;
                                                                                                                                                             

                                                                                                                                                                                                                                                             
    SET @folFormObjId = OBJECT_ID(@folFormTable);
                                                                                                                                                                                                            

                                                                                                                                                                                                                                                             
    SELECT
                                                                                                                                                                                                                                                   
      @hasIDF = MAX(CASE WHEN UPPER(name) = 'IDF' THEN 1 ELSE 0 END),
                                                                                                                                                                                        
      @hasFCN = MAX(CASE WHEN UPPER(name) = 'FCN' THEN 1 ELSE 0 END),
                                                                                                                                                                                        
      @hasIMPA = MAX(CASE WHEN UPPER(name) = 'IMPA' THEN 1 ELSE 0 END),
                                                                                                                                                                                      
      @hasIMPC = MAX(CASE WHEN UPPER(name) = 'IMPC' THEN 1 ELSE 0 END),
                                                                                                                                                                                      
      @hasIMPD = MAX(CASE WHEN UPPER(name) = 'IMPD' THEN 1 ELSE 0 END),
                                                                                                                                                                                      
      @hasAUT = MAX(CASE WHEN UPPER(name) = 'AUT' THEN 1 ELSE 0 END),
                                                                                                                                                                                        
      @hasESTA = MAX(CASE WHEN UPPER(name) = 'ESTA' THEN 1 ELSE 0 END),
                                                                                                                                                                                      
      @hasESTAF = MAX(CASE WHEN UPPER(name) = 'ESTAF' THEN 1 ELSE 0 END)
                                                                                                                                                                                     
    FROM sys.columns
                                                                                                                                                                                                                                         
    WHERE object_id = @folFormObjId;
                                                                                                                                                                                                                         

                                                                                                                                                                                                                                                             
    IF @hasIDF = 1
                                                                                                                                                                                                                                           
      SET @idfIsIdentity = CASE WHEN COLUMNPROPERTY(@folFormObjId, 'IDF', 'IsIdentity') = 1 THEN 1 ELSE 0 END;
                                                                                                                                               

                                                                                                                                                                                                                                                             
    SET @sql = N'DELETE FROM ' + @folFormTable + N' WHERE IDFOL = @pIDFOL;';
                                                                                                                                                                                 
    EXEC sys.sp_executesql
                                                                                                                                                                                                                                   
      @sql,
                                                                                                                                                                                                                                                  
      N'@pIDFOL NVARCHAR(255)',
                                                                                                                                                                                                                              
      @pIDFOL = @idfolNorm;
                                                                                                                                                                                                                                  

                                                                                                                                                                                                                                                             
    SET @cambio = CASE WHEN @sumPagos > @total THEN ROUND(@sumPagos - @total, 4) ELSE 0 END;
                                                                                                                                                                 
    SET @cambioPendiente = @cambio;
                                                                                                                                                                                                                          

                                                                                                                                                                                                                                                             
    DECLARE forma_cursor CURSOR LOCAL FAST_FORWARD FOR
                                                                                                                                                                                                       
      SELECT FORM, IMPP, AUT
                                                                                                                                                                                                                                 
      FROM @FORMAS
                                                                                                                                                                                                                                           
      ORDER BY ROW_ID;
                                                                                                                                                                                                                                       

                                                                                                                                                                                                                                                             
    OPEN forma_cursor;
                                                                                                                                                                                                                                       
    FETCH NEXT FROM forma_cursor INTO @formaForm, @formaImpp, @formaAut;
                                                                                                                                                                                     
    WHILE @@FETCH_STATUS = 0
                                                                                                                                                                                                                                 
    BEGIN
                                                                                                                                                                                                                                                    
      SET @impc = 0;
                                                                                                                                                                                                                                         
      IF @cambioPendiente > 0 AND @efectivoCambioAsignado = 0 AND @formaForm = 'EFECTIVO'
                                                                                                                                                                    
      BEGIN
                                                                                                                                                                                                                                                  
        SET @impc = @cambioPendiente;
                                                                                                                                                                                                                        
        SET @cambioPendiente = 0;
                                                                                                                                                                                                                            
        SET @efectivoCambioAsignado = 1;
                                                                                                                                                                                                                     
      END;
                                                                                                                                                                                                                                                   

                                                                                                                                                                                                                                                             
      SET @impd = ROUND(@formaImpp - @impc, 4);
      SET @execIdf = CONVERT(NVARCHAR(255), NEWID());
                                                                                                                                                                                                        

                                                                                                                                                                                                                                                             
      SET @sql = N'INSERT INTO ' + @folFormTable + N' (' +
                                                                                                                                                                                                   
        CASE WHEN @hasIDF = 1 AND @idfIsIdentity = 0 THEN N'IDF, ' ELSE N'' END +
                                                                                                                                                                            
        N'IDFOL' +
                                                                                                                                                                                                                                           
        CASE WHEN @hasFCN = 1 THEN N', FCN' ELSE N'' END +
                                                                                                                                                                                                   
        N', FORM' +
                                                                                                                                                                                                                                          
        CASE WHEN @hasIMPA = 1 THEN N', IMPA' ELSE N'' END +
                                                                                                                                                                                                 
        N', IMPP' +
                                                                                                                                                                                                                                          
        CASE WHEN @hasIMPC = 1 THEN N', IMPC' ELSE N'' END +
                                                                                                                                                                                                 
        CASE WHEN @hasIMPD = 1 THEN N', IMPD' ELSE N'' END +
                                                                                                                                                                                                 
        CASE WHEN @hasAUT = 1 THEN N', AUT' ELSE N'' END +
                                                                                                                                                                                                   
        CASE WHEN @hasESTA = 1 THEN N', ESTA' ELSE N'' END +
                                                                                                                                                                                                 
        CASE WHEN @hasESTAF = 1 THEN N', ESTAF' ELSE N'' END +
                                                                                                                                                                                               
        N') VALUES (' +
                                                                                                                                                                                                                                      
        CASE WHEN @hasIDF = 1 AND @idfIsIdentity = 0 THEN N'@pIDF, ' ELSE N'' END +
                                                                                                                                                                          
        N'@pIDFOL' +
                                                                                                                                                                                                                                         
        CASE WHEN @hasFCN = 1 THEN N', @pNOW' ELSE N'' END +
                                                                                                                                                                                                 
        N', @pFORM' +
                                                                                                                                                                                                                                        
        CASE WHEN @hasIMPA = 1 THEN N', NULL' ELSE N'' END +
                                                                                                                                                                                                 
        N', @pIMPP' +
                                                                                                                                                                                                                                        
        CASE WHEN @hasIMPC = 1 THEN N', @pIMPC' ELSE N'' END +
                                                                                                                                                                                               
        CASE WHEN @hasIMPD = 1 THEN N', @pIMPD' ELSE N'' END +
                                                                                                                                                                                               
        CASE WHEN @hasAUT = 1 THEN N', @pAUT' ELSE N'' END +
                                                                                                                                                                                                 
        CASE WHEN @hasESTA = 1 THEN N', NULL' ELSE N'' END +
                                                                                                                                                                                                 
        CASE WHEN @hasESTAF = 1 THEN N', NULL' ELSE N'' END +
                                                                                                                                                                                                
        N');';
                                                                                                                                                                                                                                               

                                                                                                                                                                                                                                                             
      EXEC sys.sp_executesql
                                                                                                                                                                                                                                 
        @sql,
                                                                                                                                                                                                                                                
        N'@pIDF NVARCHAR(255), @pIDFOL NVARCHAR(255), @pNOW DATETIME, @pFORM NVARCHAR(40), @pIMPP DECIMAL(18,4), @pIMPC DECIMAL(18,4), @pIMPD DECIMAL(18,4), @pAUT NVARCHAR(255)',
                                                                           
        @pIDF = @execIdf,
                                                                                                                                                                                                                                    
        @pIDFOL = @idfolVisibleNuevo,
                                                                                                                                                                                                                        
        @pNOW = @fechaProceso,
                                                                                                                                                                                                                               
        @pFORM = @formaForm,
                                                                                                                                                                                                                                 
        @pIMPP = @formaImpp,
                                                                                                                                                                                                                                 
        @pIMPC = @impc,
                                                                                                                                                                                                                                      
        @pIMPD = @impd,
                                                                                                                                                                                                                                     
        @pAUT = @formaAut;
                                                                                                                                                                                                                                   

                                                                                                                                                                                                                                                             
      FETCH NEXT FROM forma_cursor INTO @formaForm, @formaImpp, @formaAut;
                                                                                                                                                                                   
    END;
                                                                                                                                                                                                                                                     
    CLOSE forma_cursor;
                                                                                                                                                                                                                                      
    DEALLOCATE forma_cursor;
                                                                                                                                                                                                                                 

                                                                                                                                                                                                                                                             
    SET @ctrlObjId = OBJECT_ID('dbo.DAT_CTRL_CTAS');
                                                                                                                                                                                                         
    IF @ctrlObjId IS NOT NULL
                                                                                                                                                                                                                                
    BEGIN
                                                                                                                                                                                                                                                    
      SELECT
                                                                                                                                                                                                                                                 
        @ctrlHasCTA = MAX(CASE WHEN UPPER(name) = 'CTA' THEN 1 ELSE 0 END),
                                                                                                                                                                                  
        @ctrlHasCLIENT = MAX(CASE WHEN UPPER(name) = 'CLIENT' THEN 1 ELSE 0 END),
                                                                                                                                                                            
        @ctrlHasCMOV = MAX(CASE WHEN UPPER(name) = 'CMOV' THEN 1 ELSE 0 END),
                                                                                                                                                                                
        @ctrlHasCLSD = MAX(CASE WHEN UPPER(name) = 'CLSD' THEN 1 ELSE 0 END),
                                                                                                                                                                                
        @ctrlHasIMPT = MAX(CASE WHEN UPPER(name) = 'IMPT' THEN 1 ELSE 0 END),
                                                                                                                                                                                
        @ctrlHasNDOC = MAX(CASE WHEN UPPER(name) = 'NDOC' THEN 1 ELSE 0 END),
                                                                                                                                                                                
        @ctrlHasIDFOL = MAX(CASE WHEN UPPER(name) = 'IDFOL' THEN 1 ELSE 0 END),
                                                                                                                                                                              
        @ctrlHasSUC = MAX(CASE WHEN UPPER(name) = 'SUC' THEN 1 ELSE 0 END),
                                                                                                                                                                                  
        @ctrlHasOPV = MAX(CASE WHEN UPPER(name) = 'OPV' THEN 1 ELSE 0 END),
                                                                                                                                                                                  
        @ctrlHasIDOPV = MAX(CASE WHEN UPPER(name) = 'IDOPV' THEN 1 ELSE 0 END),
                                                                                                                                                                              
        @ctrlHasTIPO = MAX(CASE WHEN UPPER(name) = 'TIPO' THEN 1 ELSE 0 END),
                                                                                                                                                                                
        @ctrlHasRTXT = MAX(CASE WHEN UPPER(name) = 'RTXT' THEN 1 ELSE 0 END),
                                                                                                                                                                                
        @ctrlHasFCND = MAX(CASE WHEN UPPER(name) = 'FCND' THEN 1 ELSE 0 END),
                                                                                                                                                                                
        @ctrlHasFCN = MAX(CASE WHEN UPPER(name) = 'FCN' THEN 1 ELSE 0 END),
                                                                                                                                                                                  
        @ctrlHasFCNR = MAX(CASE WHEN UPPER(name) = 'FCNR' THEN 1 ELSE 0 END),
                                                                                                                                                                                
        @ctrlHasFECHA = MAX(CASE WHEN UPPER(name) = 'FECHA' THEN 1 ELSE 0 END)
                                                                                                                                                                               
      FROM sys.columns
                                                                                                                                                                                                                                       
      WHERE object_id = @ctrlObjId;
                                                                                                                                                                                                                          

                                                                                                                                                                                                                                                             
      SET @ctrlClassCol = CASE
                                                                                                                                                                                                                               
        WHEN @ctrlHasCMOV = 1 THEN 'CMOV'
                                                                                                                                                                                                                    
        WHEN @ctrlHasCLSD = 1 THEN 'CLSD'
                                                                                                                                                                                                                    
        ELSE NULL
                                                                                                                                                                                                                                            
      END;
                                                                                                                                                                                                                                                   

                                                                                                                                                                                                                                                             
      IF @datCmovObjId IS NOT NULL
                                                                                                                                                                                                                           
      BEGIN
                                                                                                                                                                                                                                                  
        SELECT
                                                                                                                                                                                                                                               
          @datCmovHasRelacion = MAX(CASE WHEN UPPER(name) = 'RELACION' THEN 1 ELSE 0 END),
                                                                                                                                                                   
          @datCmovHasCmov = MAX(CASE WHEN UPPER(name) = 'CMOV' THEN 1 ELSE 0 END),
                                                                                                                                                                           
          @datCmovHasTipo = MAX(CASE WHEN UPPER(name) = 'TIPO' THEN 1 ELSE 0 END)
                                                                                                                                                                            
        FROM sys.columns
                                                                                                                                                                                                                                     
        WHERE object_id = @datCmovObjId;
                                                                                                                                                                                                                     
      END
                                                                                                                                                                                                                                                    

                                                                                                                                                                                                                                                             
      IF @ctrlHasCTA = 1 AND @ctrlHasCLIENT = 1 AND @ctrlHasIMPT = 1 AND @ctrlHasIDFOL = 1 AND @ctrlClassCol IS NOT NULL
                                                                                                                                     
      BEGIN
                                                                                                                                                                                                                                                  
        INSERT INTO @LINES (UPC, ORD, LINE_TOTAL)
                                                                                                                                                                                                            
        SELECT
                                                                                                                                                                                                                                               
          UPPER(LTRIM(RTRIM(ISNULL(UPC, '')))) AS UPC,
                                                                                                                                                                                                       
          LTRIM(RTRIM(ISNULL(ORD, ''))) AS ORD,
                                                                                                                                                                                                              
          ROUND(
                                                                                                                                                                                                                                             
            ISNULL(TRY_CONVERT(DECIMAL(18,4), PVTA), 0)
                                                                                                                                                                                                      
            * ISNULL(NULLIF(TRY_CONVERT(DECIMAL(18,4), CTD), 0), 1),
                                                                                                                                                                                         
            4
                                                                                                                                                                                                                                                
          ) AS LINE_TOTAL
                                                                                                                                                                                                                                    
        FROM dbo.PV_TICKET_LOG
                                                                                                                                                                                                                               
        WHERE IDFOL = @idfolNorm;
                                                                                                                                                                                                                            

                                                                                                                                                                                                                                                             
        DECLARE line_cursor CURSOR LOCAL FAST_FORWARD FOR
                                                                                                                                                                                                    
          SELECT UPC, ORD, LINE_TOTAL
                                                                                                                                                                                                                        
          FROM @LINES
                                                                                                                                                                                                                                        
          ORDER BY ROW_ID;
                                                                                                                                                                                                                                   

                                                                                                                                                                                                                                                             
        OPEN line_cursor;
                                                                                                                                                                                                                                    
        FETCH NEXT FROM line_cursor INTO @lineTipps, @lineOrd, @lineTotal;
                                                                                                                                                                                   
        WHILE @@FETCH_STATUS = 0
                                                                                                                                                                                                                             
        BEGIN
                                                                                                                                                                                                                                                
          SET @movClass = NULL;
                                                                                                                                                                                                                              
          SET @cta = NULL;
                                                                                                                                                                                                                                   
          SET @lineImpt = ABS(ISNULL(@lineTotal, 0));
                                                                                                                                                                                                        
          SET @lineIdFol = @idfolVisibleNuevo;
                                                                                                                                                                                                               
          SET @rtxt = 'Abono a cliente ticket ' + @idfolVisibleNuevo;
                                                                                                                                                                                        

                                                                                                                                                                                                                                                             
          IF @datCmovObjId IS NOT NULL
                                                                                                                                                                                                                       
             AND @datCmovHasRelacion = 1
                                                                                                                                                                                                                     
             AND @datCmovHasCmov = 1
                                                                                                                                                                                                                         
          BEGIN
                                                                                                                                                                                                                                              
            IF @datCmovHasTipo = 1
                                                                                                                                                                                                                           
            BEGIN
                                                                                                                                                                                                                                            
              SELECT TOP 1 @movClass = TRY_CONVERT(INT, CMOV)
                                                                                                                                                                                                
              FROM dbo.DAT_CMOV
                                                                                                                                                                                                                              
              WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps
                                                                                                                                                                                   
                AND UPPER(LTRIM(RTRIM(ISNULL(TIPO, '')))) = 'ABONO'
                                                                                                                                                                                          
              ORDER BY CMOV;
                                                                                                                                                                                                                                 
            END
                                                                                                                                                                                                                                              
            ELSE
                                                                                                                                                                                                                                             
            BEGIN
                                                                                                                                                                                                                                            
              SELECT TOP 1 @movClass = TRY_CONVERT(INT, CMOV)
                                                                                                                                                                                                
              FROM dbo.DAT_CMOV
                                                                                                                                                                                                                              
              WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps
                                                                                                                                                                                   
              ORDER BY CMOV;
                                                                                                                                                                                                                                 
            END
                                                                                                                                                                                                                                              
          END
                                                                                                                                                                                                                                                
          ELSE
                                                                                                                                                                                                                                               
          BEGIN
                                                                                                                                                                                                                                              
            IF @lineTipps = 'DG'
                                                                                                                                                                                                                             
            BEGIN
                                                                                                                                                                                                                                            
              IF OBJECT_ID('dbo.DAT_CMOV_C', 'U') IS NOT NULL
                                                                                                                                                                                                
     AND COL_LENGTH('dbo.DAT_CMOV_C', 'RELACION') IS NOT NULL
                                                                                                                                                                                                
                 AND COL_LENGTH('dbo.DAT_CMOV_C', 'CMOV') IS NOT NULL
                                                                                                                                                                                        
              BEGIN
                                                                                                                                                                                                                                          
                SELECT TOP 1 @movClass = TRY_CONVERT(INT, CMOV)
                                                                                                                                                                                              
                FROM dbo.DAT_CMOV_C
                                                                                                                                                                                                                          
                WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps;
                                                                                                                                                                                
              END
                                                                                                                                                                                                                                            
            END
                                                                                                                                                                                                                                              
            ELSE
                                                                                                                                                                                                                                             
            BEGIN
                                                                                                                                                                                                                                            
              IF OBJECT_ID('dbo.DAT_CMOV_A', 'U') IS NOT NULL
                                                                                                                                                                                                
                 AND COL_LENGTH('dbo.DAT_CMOV_A', 'RELACION') IS NOT NULL
                                                                                                                                                                                    
                 AND COL_LENGTH('dbo.DAT_CMOV_A', 'CMOV') IS NOT NULL
                                                                                                                                                                                        
              BEGIN
                                                                                                                                                                                                                                          
                SELECT TOP 1 @movClass = TRY_CONVERT(INT, CMOV)
                                                                                                                                                                                              
                FROM dbo.DAT_CMOV_A
                                                                                                                                                                                                                          
                WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps;
                                                                                                                                                                                
              END
                                                                                                                                                                                                                                            
            END
                                                                                                                                                                                                                                              
          END;
                                                                                                                                                                                                                                               

                                                                                                                                                                                                                                                             
          IF @lineTipps = 'DG'
                                                                                                                                                                                                                               
          BEGIN
                                                                                                                                                                                                                                              
            SET @lineImpt = -ABS(ISNULL(@lineTotal, 0));
                                                                                                                                                                                                     
            SET @lineIdFol = @idfolVisibleNuevo;
                                                                                                                                                                                                             
            SET @rtxt = LTRIM(RTRIM(ISNULL(@lineOrd, ''))) + ' ticket ' + @idfolVisibleNuevo;
                                                                                                                                                                
          END
                                                                                                                                                                                                                                                
          ELSE IF @lineTipps = 'DC'
                                                                                                                                                                                                                          
          BEGIN
                                                                                                                                                                                                                                              
            SET @lineImpt = ABS(ISNULL(@lineTotal, 0));
                                                                                                                                                                                                      
            SET @lineIdFol = @idfolVisibleNuevo;
                                                                                                                                                                                                             
            SET @rtxt = LTRIM(RTRIM(ISNULL(@lineOrd, ''))) + ' ticket ' + @idfolVisibleNuevo;
                                                                                                                                                                
          END
                                                                                                                                                                                                                                                
          ELSE
                                                                                                                                                                                                                                               
          BEGIN
                                                                                                                                                                                                                                              
            SET @lineImpt = ABS(ISNULL(@lineTotal, 0));
                                                                                                                                                                                                      
            SET @lineIdFol = CASE
                                                                                                                                                                                                                            
              WHEN LTRIM(RTRIM(ISNULL(@lineOrd, ''))) = '' THEN @idfolVisibleNuevo
                                                                                                                                                                           
              ELSE @lineOrd
                                                                                                                                                                                                                                  
            END;
                                                                                                                                                                                                                                             
            SET @rtxt = 'Abono a cliente ticket ' + @idfolVisibleNuevo;
                                                                                                                                                                                      
          END;
                                                                                                                                                                                                                                               

                                                                                                                                                                                                                                                             
          IF @movClass IS NULL
                                                                                                                                                                                                                               
          BEGIN
                                                                                                                                                                                                                                              
            SET @movErr = N'No se encontrÃ³ CLSD (CMOV) para RELACION '
                                                                                                                                                                                      
              + ISNULL(@lineTipps, N'')
                                                                                                                                                                                                                      
              + N' con TIPO=ABONO.';
                                                                                                                                                                                                                         
            THROW 57134, @movErr, 1;
                                                                                                                                                                                                                         
          END;
                                                                                                                                                                                                                                               

                                                                                                                                                                                                                                                             
          IF OBJECT_ID('dbo.DAT_CAT_CTAS', 'U') IS NOT NULL
                                                                                                                                                                                                  
             AND COL_LENGTH('dbo.DAT_CAT_CTAS', 'CTA') IS NOT NULL
                                                                                                                                                                                           
             AND COL_LENGTH('dbo.DAT_CAT_CTAS', 'RELACION') IS NOT NULL
                                                                                                                                                                                      
          BEGIN
                                                                                                                                                                                                                                              
            SELECT TOP 1
                                                                                                                                                                                                                                     
              @cta = LTRIM(RTRIM(ISNULL(CTA, '')))
                                                                                                                                                                                                           
            FROM dbo.DAT_CAT_CTAS
                                                                                                                                                                                                                            
            WHERE UPPER(LTRIM(RTRIM(ISNULL(RELACION, '')))) = @lineTipps
                                                                                                                                                                                     
              AND (
                                                                                                                                                                                                                                          
                COL_LENGTH('dbo.DAT_CAT_CTAS', 'SUC') IS NULL
                                                                                                                                                                                                
                OR UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = UPPER(ISNULL(@sucDb, ''))
                                                                                                                                                                          
                OR LTRIM(RTRIM(ISNULL(SUC, ''))) = ''
                                                                                                                                                                                                        
              )
                                                                                                                                                                                                                                              
            ORDER BY CASE
                                                                                                                                                                                                                                    
              WHEN COL_LENGTH('dbo.DAT_CAT_CTAS', 'SUC') IS NULL THEN 0
                                                                                                                                                                                      
              WHEN UPPER(LTRIM(RTRIM(ISNULL(SUC, '')))) = UPPER(ISNULL(@sucDb, '')) THEN 0
                                                                                                                                                                   
              ELSE 1
                                                                                                                                                                                                                                         
            END;
                                                                                                                                                                                                                                             
          END;
                                                                                                                                                                                                                                               

                                                                                                                                                                                                                                                             
          IF @cta IS NOT NULL AND LTRIM(RTRIM(@cta)) <> ''
                                                                                                                                                                                                   
          BEGIN
                                                                                                                                                                                                                                              
            SET @ndoc = CONCAT(
                                                                                                                                                                                                                              
              'PS',
                                                                                                                                                                                                                                          
              CONVERT(VARCHAR(8), @fechaProceso, 112),
                                                                                                                                                                                                       
              REPLACE(CONVERT(VARCHAR(8), @fechaProceso, 108), ':', ''),
                                                                                                                                                                                     
              RIGHT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 6)
                                                                                                                                                                                      
            );
                                                                                                                                                                                                                                               
            SET @opvAudit = COALESCE(@userNorm, @opvDb);
                                                                                                                                                                                                     

                                                                                                                                                                                                                                                             
            SET @sql = N'
                                                                                                                                                                                                                                    
              INSERT INTO dbo.DAT_CTRL_CTAS (
                                                                                                                                                                                                                
                CTA,
                                                                                                                                                                                                                                         
                CLIENT,
                                                                                                                                                                                                                                      
                ' + @ctrlClassCol + N',
                                                                                                                                                                                                                      
                IMPT' +
                                                                                                                                                                                                                                      
                CASE WHEN @ctrlHasNDOC = 1 THEN N', NDOC' ELSE N'' END +
                                                                                                                                                                                     
                N', IDFOL' +
                                                                                                                                                                                                                                 
                CASE WHEN @ctrlHasSUC = 1 THEN N', SUC' ELSE N'' END +
                                                                                                                                                                                       
                CASE WHEN @ctrlHasOPV = 1 THEN N', OPV' ELSE N'' END +
                                                                                                                                                                                       
                CASE WHEN @ctrlHasIDOPV = 1 THEN N', IDOPV' ELSE N'' END +
                                                                                                                                                                                   
                CASE WHEN @ctrlHasTIPO = 1 THEN N', TIPO' ELSE N'' END +
                                                                                                                                                                                     
                CASE WHEN @ctrlHasRTXT = 1 THEN N', RTXT' ELSE N'' END +
                                                                                                                                                                                     
                CASE WHEN @ctrlHasFCND = 1 THEN N', FCND' ELSE N'' END +
                                                                                                                                                                                     
                CASE WHEN @ctrlHasFCN = 1 THEN N', FCN' ELSE N'' END +
                                                                                                                                                                                       
                CASE WHEN @ctrlHasFCNR = 1 THEN N', FCNR' ELSE N'' END +
                                                                                                                                                                                     
                CASE WHEN @ctrlHasFECHA = 1 THEN N', FECHA' ELSE N'' END + N'
                                                                                                                                                                                
              )
                                                                                                                                                                                                                                              
              VALUES (
                                                                                                                                                                                                                                       
                @pCTA,
                                                                                                                                                                                                                                       
                @pCLIENT,
                                                                                                                                                                                                                                    
                @pCLSD,
                                                                                                                                                                                                                                      
                @pIMPT' +
                                                                                                                                                                                                                                    
                CASE WHEN @ctrlHasNDOC = 1 THEN N', @pNDOC' ELSE N'' END +
                                                                                                                                                                                   
                N', @pIDFOL' +
                                                                                                                                                                                                                               
                CASE WHEN @ctrlHasSUC = 1 THEN N', @pSUC' ELSE N'' END +
                                                                                                                                                                                     
                CASE WHEN @ctrlHasOPV = 1 THEN N', @pOPV' ELSE N'' END +
                                                                                                                                                                                     
                CASE WHEN @ctrlHasIDOPV = 1 THEN N', @pOPV' ELSE N'' END +
                                                                                                                                                                                   
                CASE WHEN @ctrlHasTIPO = 1 THEN N', @pTIPO' ELSE N'' END +
                                                                                                                                                                                   
                CASE WHEN @ctrlHasRTXT = 1 THEN N', @pRTXT' ELSE N'' END +
                                                                                                                                                                                   
                CASE WHEN @ctrlHasFCND = 1 THEN N', @pNOW' ELSE N'' END +
                                                                                                                                                                                    
                CASE WHEN @ctrlHasFCN = 1 THEN N', @pNOW' ELSE N'' END +
                                                                                                                                                                                     
                CASE WHEN @ctrlHasFCNR = 1 THEN N', @pNOW' ELSE N'' END +
                                                                                                                                                                                    
                CASE WHEN @ctrlHasFECHA = 1 THEN N', @pNOW' ELSE N'' END + N'
                                                                                                                                                                                
              );';
                                                                                                                                                                                                                                           

                                                                                                                                                                                                                                                             
            EXEC sys.sp_executesql
                                                                                                                                                                                                                           
              @sql,
                                                                                                                                                                                                                                          
              N'@pCTA NVARCHAR(255), @pCLIENT FLOAT, @pCLSD INT, @pIMPT DECIMAL(18,4), @pNDOC NVARCHAR(255), @pIDFOL NVARCHAR(255), @pSUC NVARCHAR(20), @pOPV NVARCHAR(255), @pTIPO NVARCHAR(10), @pRTXT NVARCHAR(255), @pNOW DATETIME',
                     
              @pCTA = @cta,
                                                                                                                                                                                                                                  
              @pCLIENT = @clien,
                                                                                                                                                                                                                             
              @pCLSD = @movClass,
                                                                                                                                                                                                                            
              @pIMPT = @lineImpt,
                                                                                                                                                                                                                            
              @pNDOC = @ndoc,
                                                                                                                                                                                                                                
              @pIDFOL = @lineIdFol,
                                                                                                                                                                                                                          
              @pSUC = @sucDb,
                                                                                                                                                                                                                                
              @pOPV = @opvAudit,
                                                                                                                                                                                                                             
              @pTIPO = @lineTipps,
                                                                                                                                                                                                                           
              @pRTXT = @rtxt,
                                                                                                                                                                                                                                
              @pNOW = @fechaProceso;
                                                                                                                                                                                                                         
          END;
                                                                                                                                                                                                                                               

                                                                                                                                                                                                                                                             
          FETCH NEXT FROM line_cursor INTO @lineTipps, @lineOrd, @lineTotal;
                                                                                                                                                                                 
        END;
                                                                                                                                                                                                                                                 
        CLOSE line_cursor;
                                                                                                                                                                                                                                   
        DEALLOCATE line_cursor;
                                                                                                                                                                                                                              
      END;
                                                                                                                                                                                                                                                   
    END;
                                                                                                                                                                                                                                                     

                                                                                                                                                                                                                                                             
    IF UPPER(ISNULL(@idfolVisibleNuevo, '')) <> UPPER(ISNULL(@idfolNorm, ''))
                                                                                                                                                                                
    BEGIN
                                                                                                                                                                                                                                                    
      UPDATE dbo.PV_TICKET_LOG
                                                                                                                                                                                                                               
      SET IDFOL = @idfolVisibleNuevo
                                                                                                                                                                                                                         
      WHERE IDFOL = @idfolNorm;
                                                                                                                                                                                                                              
    END;
                                                                                                                                                                                                                                                     

                                                                                                                                                                                                                                                             
    UPDATE dbo.PV_CTR_FOL_ASVR
                                                                                                                                                                                                                               
    SET
                                                                                                                                                                                                                                                      
      IDFOL = @idfolVisibleNuevo,
                                                                                                                                                                                                                            
      TRA = COALESCE(NULLIF(@traVisibleNuevo, ''), TRA),
                                                                                                                                                                                                     
      ESTA = 'PAGADO',
                                                                                                                                                                                                                                       
      IMPT = CASE WHEN @isCashOut = 1 THEN (@total * -1) ELSE @total END,
                                                                                                                                                                                    
      IMPP = @sumPagos,
                                                                                                                                                                                                                                      
      FPGO = 'FINALIZADO',
                                                                                                                                                                                                                                   
      FCNM = @fechaProceso,
                                                                                                                                                                                                                                  
      OPVM = COALESCE(@userNorm, OPVM),
                                                                                                                                                                                                                      
      IDFOLINICIAL = ISNULL(NULLIF(LTRIM(RTRIM(IDFOLINICIAL)), ''), @idfolInicial),
                                                                                                                                                                          
      ORIGEN_AUT = @tipoVisibleFinal
                                                                                                                                                                                                                         
    WHERE IDFOL = @idfolNorm;
                                                                                                                                                                                                                                

                                                                                                                                                                                                                                                             
    IF @startedTran = 1 AND @@TRANCOUNT > 0
                                                                                                                                                                                                                  
      COMMIT TRANSACTION;
                                                                                                                                                                                                                                    

                                                                                                                                                                                                                                                             
    SELECT
                                                                                                                                                                                                                                                   
      @idfolVisibleNuevo AS IDFOL,
                                                                                                                                                                                                                           
      'PAGADO' AS ESTA,
                                                                                                                                                                                                                                      
      @total AS TOTAL,
                                                                                                                                                                                                                                       
      @sumPagos AS PAGADO,
                                                                                                                                                                                                                                   
      @cambio AS CAMBIO;
                                                                                                                                                                                                                                     
  END TRY
                                                                                                                                                                                                                                                    
  BEGIN CATCH
                                                                                                                                                                                                                                                
    IF CURSOR_STATUS('local', 'forma_cursor') >= -1
                                                                                                                                                                                                          
    BEGIN
                                                                                                                                                                                                                                                    
      CLOSE forma_cursor;
                                                                                                                                                                                                                                    
      DEALLOCATE forma_cursor;
                                                                                                                                                                                                                               
    END
                                                                                                                                                                                                                                                      

                                                                                                                                                                                                                                                             
    IF CURSOR_STATUS('local', 'line_cursor') >= -1
                                                                                                                                                                                                           
    BEGIN
                                                                                                                                                                                                                                                    
      CLOSE line_cursor;
                                                                                                                                                                                                                                     
      DEALLOCATE line_cursor;
                                                                                                                                                                                                                                
    END
                                                                                                                                                                                                                                                      

                                                                                                                                                                                                                                                             
    IF @startedTran = 1 AND @@TRANCOUNT > 0
                                                                                                                                                                                                                  
      ROLLBACK TRANSACTION;
                                                                                                                                                                                                                                  
    THROW;
                                                                                                                                                                                                                                                   
  END CATCH
                                                                                                                                                                                                                                                  
END;
                                                                                                                                                                                                                                                         

