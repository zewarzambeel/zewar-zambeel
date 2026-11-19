-- Rollback for expenses-report.sql. Warning: deletes all saved expenses.
drop function if exists public.profit_report(date, date);
drop table if exists public.expenses;
