-- Add segments column to documents table for pre-processed reading data
ALTER TABLE documents ADD COLUMN segments TEXT DEFAULT '';
