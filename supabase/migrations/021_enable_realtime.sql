-- Enable Supabase Realtime on tables used by the Telegram bot
alter publication supabase_realtime add table inbound_emails;
alter publication supabase_realtime add table interactions;
alter publication supabase_realtime add table job_log;
alter publication supabase_realtime add table persons;
alter publication supabase_realtime add table organizations;
