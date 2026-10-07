-- Asistencia (fase 8): entrada y salida van juntas, un día "presente" es el
-- único con fichada y un turno no puede durar 24 horas o más.
ALTER TABLE "attendance_day"
  ADD CONSTRAINT "attendance_day_times_pair" CHECK (("check_in" IS NULL) = ("check_out" IS NULL)),
  ADD CONSTRAINT "attendance_day_present_has_times" CHECK (("status" = 'PRESENTE') = ("check_in" IS NOT NULL)),
  ADD CONSTRAINT "attendance_day_shift_max" CHECK ("check_out" IS NULL OR "check_out" < "check_in" + INTERVAL '24 hours');
