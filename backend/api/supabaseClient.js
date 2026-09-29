import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/env.js';

// O SDK vem por <script> no index.html (sem passo de build, como no Sistema
// de Presença). Se a CDN não carregar, `sb` fica nulo e a tela de acesso
// mostra o aviso em vez de quebrar em silêncio.
export const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) ?? null;
