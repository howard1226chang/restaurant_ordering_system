import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://imiqcxklultqjlmmmlve.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltaXFjeGtsdWx0cWpsbW1tbHZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0Njk4MTIsImV4cCI6MjA5OTA0NTgxMn0.A1PyeQG_tgpcMBPwIxXg8bMCOP2YO3d911NSDKMI3Fw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
