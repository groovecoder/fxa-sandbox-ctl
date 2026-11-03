-- Schema 13: a changes row for each write that the dashboard's live stream sends and that had none. The key is
-- the field that names the row in the stream: routines and routine_runs by routine id, the tick by env, the
-- audit by team. error_resolutions is an upsert, so a second resolve of a signature is an update.
CREATE TRIGGER routines_ins AFTER INSERT ON routines BEGIN INSERT INTO changes (tbl, key) VALUES ('routines', NEW.id); END;
CREATE TRIGGER routines_upd AFTER UPDATE ON routines BEGIN INSERT INTO changes (tbl, key) VALUES ('routines', NEW.id); END;
CREATE TRIGGER routines_del AFTER DELETE ON routines BEGIN INSERT INTO changes (tbl, key) VALUES ('routines', OLD.id); END;
CREATE TRIGGER routine_runs_ins AFTER INSERT ON routine_runs BEGIN INSERT INTO changes (tbl, key) VALUES ('routine_runs', NEW.routine_id); END;
CREATE TRIGGER routine_runs_upd AFTER UPDATE ON routine_runs BEGIN INSERT INTO changes (tbl, key) VALUES ('routine_runs', NEW.routine_id); END;
CREATE TRIGGER routine_tick_env_ins AFTER INSERT ON routine_tick_env BEGIN INSERT INTO changes (tbl, key) VALUES ('routine_tick', NEW.env); END;
CREATE TRIGGER routine_tick_env_upd AFTER UPDATE ON routine_tick_env BEGIN INSERT INTO changes (tbl, key) VALUES ('routine_tick', NEW.env); END;
CREATE TRIGGER team_audit_ins AFTER INSERT ON team_audit BEGIN INSERT INTO changes (tbl, key) VALUES ('team_audit', NEW.team); END;
CREATE TRIGGER error_res_upd AFTER UPDATE ON error_resolutions BEGIN INSERT INTO changes (tbl, key) VALUES ('errors', NEW.sig); END;
