from supabase import create_client, Client
from config import get_settings


def get_supabase() -> Client:
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_key)


def get_supabase_admin() -> Client:
    """Service-role client for admin operations (bypasses RLS)."""
    s = get_settings()
    key = s.supabase_service_key or s.supabase_key
    return create_client(s.supabase_url, key)
