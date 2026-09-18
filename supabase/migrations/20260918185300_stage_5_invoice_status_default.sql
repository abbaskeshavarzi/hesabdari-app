-- Stage 5 follow-up: align the database default with the professional invoice lifecycle.
alter table public.invoices alter column status set default 'DRAFT';
