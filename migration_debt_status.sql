-- Status là TEXT nên không cần ALTER TABLE.
SELECT status, COUNT(*) FROM bookings GROUP BY status;
SELECT status, COUNT(*) FROM orders GROUP BY status;
SELECT status, COUNT(*) FROM table_sessions GROUP BY status;
