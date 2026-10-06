-- Restricciones e infraestructura que Prisma no expresa en el schema.
-- Ver docs/arquitectura.md, secciones 4.7 y 5.1.

-- Extensiones para la búsqueda de empleados (Fase 5).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ------------------------------------------------------------
-- Coherencia de fechas
-- ------------------------------------------------------------
ALTER TABLE "employee"
  ADD CONSTRAINT "employee_exit_after_hire" CHECK ("exit_date" IS NULL OR "exit_date" >= "hire_date"),
  ADD CONSTRAINT "employee_contract_end_after_hire" CHECK ("contract_end_date" IS NULL OR "contract_end_date" >= "hire_date"),
  ADD CONSTRAINT "employee_hire_after_birth" CHECK ("hire_date" > "birth_date"),
  ADD CONSTRAINT "employee_file_number_positive" CHECK ("file_number" > 0),
  ADD CONSTRAINT "employee_dni_digits" CHECK ("dni" ~ '^[0-9]{7,8}$'),
  ADD CONSTRAINT "employee_cuil_digits" CHECK ("cuil" ~ '^[0-9]{11}$'),
  ADD CONSTRAINT "employee_version_positive" CHECK ("version" > 0);

ALTER TABLE "employee_bank_account"
  ADD CONSTRAINT "employee_bank_account_cbu_digits" CHECK ("cbu" ~ '^[0-9]{22}$');

ALTER TABLE "leave_record"
  ADD CONSTRAINT "leave_record_dates" CHECK ("end_date" >= "start_date"),
  ADD CONSTRAINT "leave_record_days_non_negative" CHECK ("days" >= 0);

ALTER TABLE "document"
  ADD CONSTRAINT "document_expiry_after_issue" CHECK ("expiry_date" IS NULL OR "issue_date" IS NULL OR "expiry_date" >= "issue_date");

ALTER TABLE "attendance_day"
  ADD CONSTRAINT "attendance_day_checkout_after_checkin" CHECK ("check_out" IS NULL OR "check_in" IS NULL OR "check_out" > "check_in"),
  ADD CONSTRAINT "attendance_day_minutes_non_negative" CHECK (
    "break_minutes" >= 0 AND "worked_minutes" >= 0 AND "regular_minutes" >= 0
    AND "extra_minutes" >= 0 AND "late_minutes" >= 0
  );

ALTER TABLE "work_schedule_day"
  ADD CONSTRAINT "work_schedule_day_dow" CHECK ("day_of_week" BETWEEN 1 AND 7),
  ADD CONSTRAINT "work_schedule_day_times" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "work_schedule_day_break" CHECK ("break_minutes" >= 0);

ALTER TABLE "vacation_rule"
  ADD CONSTRAINT "vacation_rule_range" CHECK ("min_seniority_years" >= 0 AND ("max_seniority_years" IS NULL OR "max_seniority_years" > "min_seniority_years")),
  ADD CONSTRAINT "vacation_rule_days" CHECK ("days" >= 0);

ALTER TABLE "vacation_balance"
  ADD CONSTRAINT "vacation_balance_entitled" CHECK ("entitled_days" >= 0 AND "carried_over_days" >= 0),
  ADD CONSTRAINT "vacation_balance_adjustment_reason" CHECK ("adjustment_days" = 0 OR "adjustment_reason" IS NOT NULL);

-- ------------------------------------------------------------
-- Importes no negativos
-- ------------------------------------------------------------
ALTER TABLE "salary_history"
  ADD CONSTRAINT "salary_history_basic_non_negative" CHECK ("basic_salary" >= 0);

ALTER TABLE "payroll_record"
  ADD CONSTRAINT "payroll_record_amounts_non_negative" CHECK ("gross_reported" >= 0 AND "deductions_reported" >= 0 AND "net_reported" >= 0),
  ADD CONSTRAINT "payroll_record_period_first_day" CHECK (EXTRACT(DAY FROM "period") = 1);

ALTER TABLE "novelty"
  ADD CONSTRAINT "novelty_amount_non_negative" CHECK ("amount" IS NULL OR "amount" >= 0),
  ADD CONSTRAINT "novelty_quantity_non_negative" CHECK ("quantity" IS NULL OR "quantity" >= 0),
  ADD CONSTRAINT "novelty_period_first_day" CHECK (EXTRACT(DAY FROM "period") = 1);

-- ------------------------------------------------------------
-- Auditoría inmutable
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log es de solo inserción: no se permite %', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
