/** Select string that yields an AssistanceCall with its table summary embedded. */
export const CALL_SELECT = '*, table:dining_tables!assistance_calls_table_id_fkey(id,code,label,area)';
