-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVO', 'EGRESADO');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('F', 'M', 'X');

-- CreateEnum
CREATE TYPE "LeaveClass" AS ENUM ('LICENCIA', 'AUSENCIA', 'VACACIONES', 'SUSPENSION');

-- CreateEnum
CREATE TYPE "CountingMode" AS ENUM ('CORRIDOS', 'HABILES');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('SOLICITADA', 'APROBADA', 'RECHAZADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENTE', 'AUSENTE', 'JUSTIFICADO', 'FRANCO', 'FERIADO');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDIENTE', 'PRESENTADO', 'OBSERVADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "ConceptNature" AS ENUM ('HABER', 'DESCUENTO', 'INFORMATIVO');

-- CreateEnum
CREATE TYPE "SalaryConceptKind" AS ENUM ('BASICO', 'ADICIONAL', 'BONIFICACION', 'PREMIO', 'HORAS_EXTRAS', 'OTRO');

-- CreateEnum
CREATE TYPE "NoveltyStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'INFORMADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "ExitStatus" AS ENUM ('EN_TRAMITE', 'CONFIRMADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('PUESTO', 'SECTOR', 'CATEGORIA', 'JORNADA', 'HORARIO', 'MODALIDAD', 'ESTABLECIMIENTO', 'CONTRATACION', 'CONVENIO', 'SUPERIOR', 'DATOS_BANCARIOS', 'REINGRESO', 'OTRO');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'SOFT_DELETE', 'DELETE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PERMISSION_CHANGE', 'EXPORT', 'IMPORT', 'FILE_DOWNLOAD', 'ACCESS_DENIED');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('EMPLOYEES');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('VALIDADO', 'CONFIRMADO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "employee_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "cuit" TEXT NOT NULL,
    "address_line" TEXT,
    "city" TEXT,
    "province_id" UUID,
    "postal_code" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "default_art_provider_id" UUID,
    "default_workplace_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "province" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holiday" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "is_non_working_optional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_value" (
    "id" UUID NOT NULL,
    "group" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "lookup_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collective_agreement" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "union_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "collective_agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "agreement_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workplace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address_line" TEXT,
    "city" TEXT,
    "province_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "workplace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "has_end_date" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "contract_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workday_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "weekly_hours" DECIMAL(5,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "workday_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "weekly_hours" DECIMAL(5,2) NOT NULL,
    "work_modality_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "work_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule_day" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "day_of_week" SMALLINT NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "crosses_midnight" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "work_schedule_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_insurer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rnos_code" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "health_insurer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "art_provider" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "art_provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee" (
    "id" UUID NOT NULL,
    "file_number" INTEGER NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "dni" VARCHAR(8) NOT NULL,
    "cuil" VARCHAR(11) NOT NULL,
    "birth_date" DATE NOT NULL,
    "nationality_id" UUID,
    "marital_status_id" UUID,
    "sex" "Sex" NOT NULL,
    "address_line" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province_id" UUID NOT NULL,
    "postal_code" VARCHAR(8) NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "emergency_contact_name" TEXT,
    "emergency_contact_phone" TEXT,
    "hire_date" DATE NOT NULL,
    "seniority_date" DATE NOT NULL,
    "contract_end_date" DATE,
    "exit_date" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVO',
    "department_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "category_id" UUID,
    "contract_type_id" UUID NOT NULL,
    "workday_type_id" UUID,
    "work_schedule_id" UUID,
    "work_modality_id" UUID,
    "agreement_id" UUID,
    "health_insurer_id" UUID,
    "art_provider_id" UUID,
    "workplace_id" UUID NOT NULL,
    "supervisor_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_bank_account" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "bank_id" UUID NOT NULL,
    "cbu" VARCHAR(22) NOT NULL,
    "alias" TEXT,
    "account_type_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "employee_bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_change_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "change_set_id" UUID NOT NULL,
    "change_type" "ChangeType" NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT,
    "old_ref_id" UUID,
    "new_ref_id" UUID,
    "effective_date" DATE NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_change_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_concept_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nature" "ConceptNature" NOT NULL,
    "kind" "SalaryConceptKind" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "salary_concept_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_history" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "basic_salary" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "salary_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_record" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "gross_reported" DECIMAL(14,2) NOT NULL,
    "deductions_reported" DECIMAL(14,2) NOT NULL,
    "net_reported" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "payroll_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_record_line" (
    "id" UUID NOT NULL,
    "payroll_record_id" UUID NOT NULL,
    "concept_type_id" UUID NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(10,2),
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payroll_record_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "class" "LeaveClass" NOT NULL,
    "counting_mode" "CountingMode" NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "requires_certificate" BOOLEAN NOT NULL DEFAULT false,
    "max_days_per_event" INTEGER,
    "max_days_per_year" INTEGER,
    "counts_for_absenteeism" BOOLEAN NOT NULL DEFAULT false,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "generates_novelty_type_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "leave_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_record" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'SOLICITADA',
    "vacation_balance_id" UUID,
    "requested_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ,
    "decision_notes" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "leave_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacation_rule" (
    "id" UUID NOT NULL,
    "min_seniority_years" INTEGER NOT NULL,
    "max_seniority_years" INTEGER,
    "days" INTEGER NOT NULL,
    "counting_mode" "CountingMode" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "vacation_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacation_balance" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled_days" INTEGER NOT NULL,
    "adjustment_days" INTEGER NOT NULL DEFAULT 0,
    "adjustment_reason" TEXT,
    "carried_over_days" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "vacation_balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_day" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "check_in" TIMESTAMPTZ,
    "check_out" TIMESTAMPTZ,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "regular_minutes" INTEGER NOT NULL DEFAULT 0,
    "extra_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL,
    "leave_record_id" UUID,
    "source" "RecordSource" NOT NULL DEFAULT 'MANUAL',
    "external_ref" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "attendance_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "requires_expiry" BOOLEAN NOT NULL DEFAULT false,
    "default_validity_days" INTEGER,
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "alert_days_before" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "document_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_file" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "document_type_id" UUID NOT NULL,
    "issue_date" DATE,
    "expiry_date" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PRESENTADO',
    "file_id" UUID,
    "leave_record_id" UUID,
    "exit_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novelty_type" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nature" "ConceptNature" NOT NULL,
    "requires_amount" BOOLEAN NOT NULL DEFAULT false,
    "requires_quantity" BOOLEAN NOT NULL DEFAULT false,
    "quantity_unit" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "novelty_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novelty" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "novelty_type_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "period" DATE NOT NULL,
    "quantity" DECIMAL(10,2),
    "amount" DECIMAL(14,2),
    "status" "NoveltyStatus" NOT NULL DEFAULT 'PENDIENTE',
    "source_type" TEXT,
    "source_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "novelty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_exit" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "exit_date" DATE NOT NULL,
    "exit_type_id" UUID NOT NULL,
    "exit_reason_id" UUID NOT NULL,
    "status" "ExitStatus" NOT NULL DEFAULT 'EN_TRAMITE',
    "notes" TEXT,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,

    CONSTRAINT "employee_exit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "user_email" TEXT,
    "action" "AuditAction" NOT NULL,
    "module" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "result" "AuditResult" NOT NULL DEFAULT 'SUCCESS',
    "message" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_job" (
    "id" UUID NOT NULL,
    "type" "ImportType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'VALIDADO',
    "total_rows" INTEGER NOT NULL,
    "valid_rows" INTEGER NOT NULL,
    "error_rows" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ,

    CONSTRAINT "import_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_dismissal" (
    "id" UUID NOT NULL,
    "alert_key" TEXT NOT NULL,
    "dismissed_until" DATE,
    "dismissed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_dismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_employee_id_key" ON "user"("employee_id");

-- CreateIndex
CREATE INDEX "user_role_id_idx" ON "user"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "company_cuit_key" ON "company"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "province_code_key" ON "province"("code");

-- CreateIndex
CREATE UNIQUE INDEX "province_name_key" ON "province"("name");

-- CreateIndex
CREATE UNIQUE INDEX "holiday_date_key" ON "holiday"("date");

-- CreateIndex
CREATE INDEX "lookup_value_group_is_active_idx" ON "lookup_value"("group", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_value_group_code_key" ON "lookup_value"("group", "code");

-- CreateIndex
CREATE UNIQUE INDEX "department_name_key" ON "department"("name");

-- CreateIndex
CREATE UNIQUE INDEX "department_code_key" ON "department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "position_name_key" ON "position"("name");

-- CreateIndex
CREATE INDEX "position_department_id_idx" ON "position"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "collective_agreement_number_key" ON "collective_agreement"("number");

-- CreateIndex
CREATE UNIQUE INDEX "category_agreement_id_name_key" ON "category"("agreement_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "workplace_name_key" ON "workplace"("name");

-- CreateIndex
CREATE UNIQUE INDEX "contract_type_name_key" ON "contract_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "workday_type_name_key" ON "workday_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedule_name_key" ON "work_schedule"("name");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedule_day_schedule_id_day_of_week_key" ON "work_schedule_day"("schedule_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "health_insurer_rnos_code_key" ON "health_insurer"("rnos_code");

-- CreateIndex
CREATE UNIQUE INDEX "art_provider_name_key" ON "art_provider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_code_key" ON "bank"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employee_file_number_key" ON "employee"("file_number");

-- CreateIndex
CREATE UNIQUE INDEX "employee_dni_key" ON "employee"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "employee_cuil_key" ON "employee"("cuil");

-- CreateIndex
CREATE INDEX "employee_status_idx" ON "employee"("status");

-- CreateIndex
CREATE INDEX "employee_department_id_idx" ON "employee"("department_id");

-- CreateIndex
CREATE INDEX "employee_position_id_idx" ON "employee"("position_id");

-- CreateIndex
CREATE INDEX "employee_workplace_id_idx" ON "employee"("workplace_id");

-- CreateIndex
CREATE INDEX "employee_hire_date_idx" ON "employee"("hire_date");

-- CreateIndex
CREATE INDEX "employee_last_name_first_name_idx" ON "employee"("last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "employee_bank_account_employee_id_key" ON "employee_bank_account"("employee_id");

-- CreateIndex
CREATE INDEX "employee_change_history_employee_id_effective_date_idx" ON "employee_change_history"("employee_id", "effective_date");

-- CreateIndex
CREATE INDEX "employee_change_history_change_set_id_idx" ON "employee_change_history"("change_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_concept_type_name_key" ON "salary_concept_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "salary_history_employee_id_effective_date_key" ON "salary_history"("employee_id", "effective_date");

-- CreateIndex
CREATE INDEX "payroll_record_period_idx" ON "payroll_record"("period");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_record_employee_id_period_key" ON "payroll_record"("employee_id", "period");

-- CreateIndex
CREATE INDEX "payroll_record_line_payroll_record_id_idx" ON "payroll_record_line"("payroll_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_type_name_key" ON "leave_type"("name");

-- CreateIndex
CREATE INDEX "leave_record_employee_id_start_date_idx" ON "leave_record"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_record_status_start_date_idx" ON "leave_record"("status", "start_date");

-- CreateIndex
CREATE INDEX "leave_record_leave_type_id_idx" ON "leave_record"("leave_type_id");

-- CreateIndex
CREATE INDEX "leave_record_vacation_balance_id_idx" ON "leave_record"("vacation_balance_id");

-- CreateIndex
CREATE UNIQUE INDEX "vacation_rule_min_seniority_years_key" ON "vacation_rule"("min_seniority_years");

-- CreateIndex
CREATE UNIQUE INDEX "vacation_balance_employee_id_year_key" ON "vacation_balance"("employee_id", "year");

-- CreateIndex
CREATE INDEX "attendance_day_date_idx" ON "attendance_day"("date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_day_employee_id_date_key" ON "attendance_day"("employee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "document_type_name_key" ON "document_type"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stored_file_storage_key_key" ON "stored_file"("storage_key");

-- CreateIndex
CREATE INDEX "document_employee_id_idx" ON "document"("employee_id");

-- CreateIndex
CREATE INDEX "document_expiry_date_idx" ON "document"("expiry_date");

-- CreateIndex
CREATE INDEX "document_document_type_id_idx" ON "document"("document_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "novelty_type_name_key" ON "novelty_type"("name");

-- CreateIndex
CREATE INDEX "novelty_employee_id_idx" ON "novelty"("employee_id");

-- CreateIndex
CREATE INDEX "novelty_period_status_idx" ON "novelty"("period", "status");

-- CreateIndex
CREATE INDEX "novelty_source_type_source_id_idx" ON "novelty"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "employee_exit_employee_id_idx" ON "employee_exit"("employee_id");

-- CreateIndex
CREATE INDEX "employee_exit_exit_date_idx" ON "employee_exit"("exit_date");

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log"("occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_user_id_occurred_at_idx" ON "audit_log"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_module_occurred_at_idx" ON "audit_log"("module", "occurred_at");

-- CreateIndex
CREATE INDEX "import_job_created_by_id_created_at_idx" ON "import_job"("created_by_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "alert_dismissal_alert_key_key" ON "alert_dismissal"("alert_key");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_default_art_provider_id_fkey" FOREIGN KEY ("default_art_provider_id") REFERENCES "art_provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company" ADD CONSTRAINT "company_default_workplace_id_fkey" FOREIGN KEY ("default_workplace_id") REFERENCES "workplace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "collective_agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace" ADD CONSTRAINT "workplace_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule" ADD CONSTRAINT "work_schedule_work_modality_id_fkey" FOREIGN KEY ("work_modality_id") REFERENCES "lookup_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule_day" ADD CONSTRAINT "work_schedule_day_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_nationality_id_fkey" FOREIGN KEY ("nationality_id") REFERENCES "lookup_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_marital_status_id_fkey" FOREIGN KEY ("marital_status_id") REFERENCES "lookup_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_contract_type_id_fkey" FOREIGN KEY ("contract_type_id") REFERENCES "contract_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_workday_type_id_fkey" FOREIGN KEY ("workday_type_id") REFERENCES "workday_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_work_schedule_id_fkey" FOREIGN KEY ("work_schedule_id") REFERENCES "work_schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_work_modality_id_fkey" FOREIGN KEY ("work_modality_id") REFERENCES "lookup_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "collective_agreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_health_insurer_id_fkey" FOREIGN KEY ("health_insurer_id") REFERENCES "health_insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_art_provider_id_fkey" FOREIGN KEY ("art_provider_id") REFERENCES "art_provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_workplace_id_fkey" FOREIGN KEY ("workplace_id") REFERENCES "workplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee" ADD CONSTRAINT "employee_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank_account" ADD CONSTRAINT "employee_bank_account_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank_account" ADD CONSTRAINT "employee_bank_account_bank_id_fkey" FOREIGN KEY ("bank_id") REFERENCES "bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_bank_account" ADD CONSTRAINT "employee_bank_account_account_type_id_fkey" FOREIGN KEY ("account_type_id") REFERENCES "lookup_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_change_history" ADD CONSTRAINT "employee_change_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_change_history" ADD CONSTRAINT "employee_change_history_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_record" ADD CONSTRAINT "payroll_record_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_record_line" ADD CONSTRAINT "payroll_record_line_payroll_record_id_fkey" FOREIGN KEY ("payroll_record_id") REFERENCES "payroll_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_record_line" ADD CONSTRAINT "payroll_record_line_concept_type_id_fkey" FOREIGN KEY ("concept_type_id") REFERENCES "salary_concept_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_type" ADD CONSTRAINT "leave_type_generates_novelty_type_id_fkey" FOREIGN KEY ("generates_novelty_type_id") REFERENCES "novelty_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_record" ADD CONSTRAINT "leave_record_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_record" ADD CONSTRAINT "leave_record_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_record" ADD CONSTRAINT "leave_record_vacation_balance_id_fkey" FOREIGN KEY ("vacation_balance_id") REFERENCES "vacation_balance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_record" ADD CONSTRAINT "leave_record_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_record" ADD CONSTRAINT "leave_record_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacation_balance" ADD CONSTRAINT "vacation_balance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_day" ADD CONSTRAINT "attendance_day_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_day" ADD CONSTRAINT "attendance_day_leave_record_id_fkey" FOREIGN KEY ("leave_record_id") REFERENCES "leave_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_leave_record_id_fkey" FOREIGN KEY ("leave_record_id") REFERENCES "leave_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_exit_id_fkey" FOREIGN KEY ("exit_id") REFERENCES "employee_exit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novelty" ADD CONSTRAINT "novelty_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novelty" ADD CONSTRAINT "novelty_novelty_type_id_fkey" FOREIGN KEY ("novelty_type_id") REFERENCES "novelty_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novelty" ADD CONSTRAINT "novelty_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exit" ADD CONSTRAINT "employee_exit_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exit" ADD CONSTRAINT "employee_exit_exit_type_id_fkey" FOREIGN KEY ("exit_type_id") REFERENCES "lookup_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exit" ADD CONSTRAINT "employee_exit_exit_reason_id_fkey" FOREIGN KEY ("exit_reason_id") REFERENCES "lookup_value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_exit" ADD CONSTRAINT "employee_exit_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_dismissal" ADD CONSTRAINT "alert_dismissal_dismissed_by_id_fkey" FOREIGN KEY ("dismissed_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
