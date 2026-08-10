import { createClient } from '@supabase/supabase-js';

export const STORAGE_KEY = 'pharmacy-tracker-data';
export const WORK_DAYS_PER_MONTH = 26;
export const WORK_HOURS_PER_DAY = 8;

const supabaseUrl = 'https://jjosopujlxgkhrragumj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impqb3NvcHVqbHhna2hycmFndW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MzA2NjQsImV4cCI6MjEwMDIwNjY2NH0.m91fh2xgaU72oEfNacFF2BICNuGuvEg3t_sHc2U8n9M';

export const db = createClient(supabaseUrl, supabaseKey);
