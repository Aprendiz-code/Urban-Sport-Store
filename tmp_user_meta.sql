select id, email, raw_app_meta, raw_user_meta from auth.users where raw_app_meta is not null or raw_user_meta is not null order by email limit 50;  
