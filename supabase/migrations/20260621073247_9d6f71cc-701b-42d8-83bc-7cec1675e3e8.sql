
-- =========================================================
-- PLANIPRÊT PHASE 1 — Fondations DB (AVA-only)
-- Org cible: AVA Main Dashboard = 17d6507f-a9ca-409d-8e49-371d50332615
-- =========================================================

-- 1) Ajout des rôles Planiprêt à l'enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'planipret_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'planipret_broker';
