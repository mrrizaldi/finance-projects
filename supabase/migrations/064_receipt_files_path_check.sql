ALTER TABLE public.receipt_files
  ADD CONSTRAINT receipt_files_path_owner CHECK (split_part(path, '/', 1) = user_id::text);
