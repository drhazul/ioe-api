import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';

type SecurePinValidationInput = {
  idUsuario: number;
  securePin?: string | null;
};

type SecurePinValidationResult = {
  accepted: boolean;
  reason: string | null;
};

type DuressInput = {
  idUsuario: number;
  fingerprintId?: string | null;
};

type DuressResult = {
  isDuress: boolean;
  reason: string | null;
};

@Injectable()
export class AuthManagerService {
  constructor(private readonly dataSource: DataSource) {}

  async validateSecurePin(
    input: SecurePinValidationInput,
  ): Promise<SecurePinValidationResult> {
    const provided = String(input.securePin ?? '').trim();
    const rows = await this.dataSource.query(
      `
      IF OBJECT_ID('dbo.COLABORADORES', 'U') IS NULL
      BEGIN
        SELECT
          CAST(NULL AS VARCHAR(120)) AS secure_pin,
          CAST(NULL AS VARCHAR(255)) AS pin,
          CAST(0 AS BIT) AS has_biometric_active;
        RETURN;
      END

      DECLARE @securePinHash VARCHAR(120) = NULL;
      DECLARE @colaboradorPin VARCHAR(255) = NULL;
      DECLARE @hasBiometricActive BIT = 0;

      IF COL_LENGTH('dbo.COLABORADORES', 'secure_pin') IS NOT NULL
      BEGIN
        SELECT TOP 1 @securePinHash = LTRIM(RTRIM(ISNULL(c.secure_pin, '')))
        FROM dbo.COLABORADORES c
        LEFT JOIN dbo.USUARIO u
          ON u.IDUSUARIO = @0
        WHERE c.id = @0
           OR (
                COL_LENGTH('dbo.COLABORADORES', 'id_empleado') IS NOT NULL
                AND u.USERNAME IS NOT NULL
                AND UPPER(LTRIM(RTRIM(ISNULL(c.id_empleado, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, ''))))
              )
        ORDER BY
          CASE WHEN c.id = @0 THEN 0 ELSE 1 END,
          c.id ASC;
      END

      SELECT TOP 1 @colaboradorPin = LTRIM(RTRIM(ISNULL(c.pin, '')))
      FROM dbo.COLABORADORES c
      LEFT JOIN dbo.USUARIO u
        ON u.IDUSUARIO = @0
      WHERE c.id = @0
         OR (
              COL_LENGTH('dbo.COLABORADORES', 'id_empleado') IS NOT NULL
              AND u.USERNAME IS NOT NULL
              AND UPPER(LTRIM(RTRIM(ISNULL(c.id_empleado, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, ''))))
            )
      ORDER BY
        CASE WHEN c.id = @0 THEN 0 ELSE 1 END,
        c.id ASC;

      IF OBJECT_ID('dbo.ATT_BIOMETRIC_TEMPLATE', 'U') IS NOT NULL
      BEGIN
        SELECT TOP 1 @hasBiometricActive = 1
        FROM dbo.ATT_BIOMETRIC_TEMPLATE bt
        WHERE bt.IDUSUARIO = @0
          AND (
            COL_LENGTH('dbo.ATT_BIOMETRIC_TEMPLATE', 'ACTIVE') IS NULL
            OR ISNULL(bt.ACTIVE, 1) = 1
          );
      END

      SELECT
        @securePinHash AS secure_pin,
        @colaboradorPin AS pin,
        @hasBiometricActive AS has_biometric_active;
      `,
      [input.idUsuario],
    );

    const row = rows?.[0] as Record<string, unknown> | undefined;
    const securePinHash = String(
      row?.secure_pin ?? row?.SECURE_PIN ?? '',
    ).trim();
    const collaboratorPin = String(row?.pin ?? row?.PIN ?? '').trim();
    const hasBiometricActive =
      Number(
        row?.has_biometric_active ??
          row?.HAS_BIOMETRIC_ACTIVE ??
          row?.active_biometric ??
          row?.ACTIVE_BIOMETRIC ??
          0,
      ) === 1;

    let pinAccepted = false;
    if (provided.length) {
      if (securePinHash.length) {
        if (this.isBcryptHash(securePinHash)) {
          pinAccepted = await bcrypt.compare(provided, securePinHash);
        } else {
          pinAccepted = securePinHash.toUpperCase() === provided.toUpperCase();
        }
      }

      if (!pinAccepted && collaboratorPin.length) {
        if (this.isBcryptHash(collaboratorPin)) {
          pinAccepted = await bcrypt.compare(provided, collaboratorPin);
        } else {
          pinAccepted =
            collaboratorPin.toUpperCase() === provided.toUpperCase();
        }
      }
    }

    if (pinAccepted || hasBiometricActive) {
      return { accepted: true, reason: null };
    }

    const reason = provided.length
      ? 'PIN inválido y sin biométrico activo'
      : 'Sin PIN y sin biométrico activo';

    return {
      accepted: false,
      reason,
    };
  }

  async detectDuressFingerprint(input: DuressInput): Promise<DuressResult> {
    const fingerprintId = String(input.fingerprintId ?? '').trim();
    if (!fingerprintId.length) {
      return { isDuress: false, reason: null };
    }

    const rows = await this.dataSource.query(
      `
      IF OBJECT_ID('dbo.COLABORADORES', 'U') IS NULL
      BEGIN
        SELECT CAST(0 AS BIT) AS is_duress, CAST(NULL AS VARCHAR(120)) AS reason;
        RETURN;
      END

      DECLARE @fingerEmergency VARCHAR(60) = NULL;

      IF COL_LENGTH('dbo.COLABORADORES', 'huella_coaccion_id') IS NOT NULL
      BEGIN
        SELECT TOP 1 @fingerEmergency = LTRIM(RTRIM(ISNULL(c.huella_coaccion_id, '')))
        FROM dbo.COLABORADORES c
        LEFT JOIN dbo.USUARIO u
          ON u.IDUSUARIO = @0
        WHERE c.id = @0
           OR (
                COL_LENGTH('dbo.COLABORADORES', 'id_empleado') IS NOT NULL
                u.USERNAME IS NOT NULL
                AND UPPER(LTRIM(RTRIM(ISNULL(c.id_empleado, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, ''))))
              )
        ORDER BY
          CASE WHEN c.id = @0 THEN 0 ELSE 1 END,
          c.id ASC;
      END
      ELSE IF COL_LENGTH('dbo.COLABORADORES', 'emergency_finger_id') IS NOT NULL
      BEGIN
        SELECT TOP 1 @fingerEmergency = LTRIM(RTRIM(ISNULL(c.emergency_finger_id, '')))
        FROM dbo.COLABORADORES c
        LEFT JOIN dbo.USUARIO u
          ON u.IDUSUARIO = @0
        WHERE c.id = @0
           OR (
                COL_LENGTH('dbo.COLABORADORES', 'id_empleado') IS NOT NULL
                u.USERNAME IS NOT NULL
                AND UPPER(LTRIM(RTRIM(ISNULL(c.id_empleado, '')))) = UPPER(LTRIM(RTRIM(ISNULL(u.USERNAME, ''))))
              )
        ORDER BY
          CASE WHEN c.id = @0 THEN 0 ELSE 1 END,
          c.id ASC;
      END

      IF @fingerEmergency IS NULL OR @fingerEmergency = ''
      BEGIN
        SELECT CAST(0 AS BIT) AS is_duress, CAST(NULL AS VARCHAR(120)) AS reason;
        RETURN;
      END

      SELECT
        CAST(CASE WHEN UPPER(@fingerEmergency) = UPPER(@1) THEN 1 ELSE 0 END AS BIT) AS is_duress,
        CASE
          WHEN UPPER(@fingerEmergency) = UPPER(@1) THEN 'Huella de coacción detectada'
          ELSE NULL
        END AS reason;
      `,
      [input.idUsuario, fingerprintId],
    );

    const row = rows?.[0] as Record<string, unknown> | undefined;
    return {
      isDuress: Number(row?.is_duress ?? row?.IS_DURESS ?? 0) === 1,
      reason: (row?.reason ?? row?.REASON ?? null) as string | null,
    };
  }

  private isBcryptHash(value: string) {
    return /^\$2[aby]\$[0-9]{2}\$/.test(String(value ?? '').trim());
  }
}
