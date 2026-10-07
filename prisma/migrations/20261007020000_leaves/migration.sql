-- Fase 7: el modo de conteo de las vacaciones es el del tipo de licencia de
-- clase VACACIONES; la regla solo define los días por rango de antigüedad.
ALTER TABLE "vacation_rule" DROP COLUMN "counting_mode";

-- Topes de aviso de los tipos de licencia: positivos si se cargan.
ALTER TABLE "leave_type"
  ADD CONSTRAINT "leave_type_max_days_positive" CHECK (
    ("max_days_per_event" IS NULL OR "max_days_per_event" > 0) AND
    ("max_days_per_year" IS NULL OR "max_days_per_year" > 0)
  );

-- Solo los registros de vacaciones se imputan a un período anual.
CREATE INDEX "leave_record_employee_status_idx" ON "leave_record" ("employee_id", "status", "end_date");
