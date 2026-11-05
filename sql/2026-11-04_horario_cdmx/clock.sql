CREATE OR ALTER FUNCTION dbo.fn_ioe_business_datetime(@InstantUtc datetime2(7))
RETURNS datetime2(7)
AS
BEGIN
  -- Argumento = instante UTC real. Resultado = calendario comercial sin zona.
  RETURN CONVERT(datetime2(7),
    @InstantUtc AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time (Mexico)');
END;
