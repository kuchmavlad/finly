-- Auth account deletion must remove all private journal data in the same statement.
begin;
alter table ibkr_private.events add foreign key(user_id) references auth.users(id) on delete cascade;
alter table ibkr_private.postings add foreign key(user_id) references auth.users(id) on delete cascade;
alter table ibkr_private.provenance add foreign key(user_id) references auth.users(id) on delete cascade;
alter table ibkr_private.confirmations add foreign key(user_id) references auth.users(id) on delete cascade;
commit;
