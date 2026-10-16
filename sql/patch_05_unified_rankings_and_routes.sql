-- ==============================================================================
-- PADDLESAFE - PARCHE 5: RANKINGS UNIFICADOS (RUTAS + USER_ROUTES)
-- Ejecutar en el SQL Editor de Supabase
-- ==============================================================================

-- 1. RANKING DE RIDERS UNIFICADO (INCLUYE ENTRENAMIENTOS DE USER_ROUTES Y RUTAS)
CREATE OR REPLACE FUNCTION public.get_ranking_riders(periodo text)
RETURNS TABLE(id uuid, nombre text, avatar_url text, puntos_periodo bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF periodo = 'historico' THEN
    RETURN QUERY
    SELECT 
      p.id,
      p.nombre,
      p.avatar_url,
      COALESCE(p.total_xp, p.puntos, 0)::bigint AS puntos_periodo
    FROM public.perfiles p
    WHERE NOT COALESCE(p.is_private, false)
    ORDER BY puntos_periodo DESC
    LIMIT 50;
  ELSE
    RETURN QUERY
    WITH puntos_combinados AS (
      -- Puntos de la tabla tradicional 'rutas'
      SELECT 
        r.user_id,
        (ROUND(r.distancia_km * 10) + r.tiempo_minutos)::bigint AS pts
      FROM public.rutas r
      WHERE (
        (periodo = 'diario' AND r.fecha >= date_trunc('day', timezone('utc', now()))) OR
        (periodo = 'semanal' AND r.fecha >= date_trunc('week', timezone('utc', now()))) OR
        (periodo = 'mensual' AND r.fecha >= date_trunc('month', timezone('utc', now()))) OR
        (periodo = 'anual' AND r.fecha >= date_trunc('year', timezone('utc', now())))
      )
      UNION ALL
      -- Puntos de la tabla avanzada 'user_routes' (GPX y telemetría)
      SELECT 
        ur.user_id,
        COALESCE(ur.xp_earned, (ROUND(ur.distance_km * 10) + ROUND(ur.duration_seconds / 60)))::bigint AS pts
      FROM public.user_routes ur
      WHERE (
        (periodo = 'diario' AND ur.created_at >= date_trunc('day', timezone('utc', now()))) OR
        (periodo = 'semanal' AND ur.created_at >= date_trunc('week', timezone('utc', now()))) OR
        (periodo = 'mensual' AND ur.created_at >= date_trunc('month', timezone('utc', now()))) OR
        (periodo = 'anual' AND ur.created_at >= date_trunc('year', timezone('utc', now())))
      )
    )
    SELECT 
      p.id,
      p.nombre,
      p.avatar_url,
      COALESCE(SUM(pc.pts), 0)::bigint AS puntos_periodo
    FROM public.perfiles p
    JOIN puntos_combinados pc ON pc.user_id = p.id
    WHERE NOT COALESCE(p.is_private, false)
    GROUP BY p.id, p.nombre, p.avatar_url
    ORDER BY puntos_periodo DESC
    LIMIT 50;
  END IF;
END;
$$;

-- 2. RANKING DE CLUBES V2 UNIFICADO (RUTAS + USER_ROUTES VÍA CLUBS_USUARIOS)
CREATE OR REPLACE FUNCTION public.get_ranking_clubs_v2(periodo text)
RETURNS TABLE(
  club_id uuid,
  nombre text,
  logo_url text,
  nivel integer,
  miembros integer,
  km_totales numeric,
  tiempo_total integer,
  rutas_totales integer,
  puntos_periodo bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH actividades_miembros AS (
    SELECT 
      cu.club_id,
      r.distancia_km,
      r.tiempo_minutos,
      (ROUND(r.distancia_km * 10) + r.tiempo_minutos)::bigint AS pts
    FROM public.clubs_usuarios cu
    JOIN public.rutas r ON r.user_id = cu.user_id
    WHERE (
      (periodo = 'diario' AND r.fecha >= date_trunc('day', timezone('utc', now()))) OR
      (periodo = 'semanal' AND r.fecha >= date_trunc('week', timezone('utc', now()))) OR
      (periodo = 'mensual' AND r.fecha >= date_trunc('month', timezone('utc', now()))) OR
      (periodo = 'anual' AND r.fecha >= date_trunc('year', timezone('utc', now()))) OR
      (periodo = 'historico')
    )
    UNION ALL
    SELECT 
      cu.club_id,
      ur.distance_km AS distancia_km,
      ROUND(ur.duration_seconds / 60)::integer AS tiempo_minutos,
      COALESCE(ur.xp_earned, (ROUND(ur.distance_km * 10) + ROUND(ur.duration_seconds / 60)))::bigint AS pts
    FROM public.clubs_usuarios cu
    JOIN public.user_routes ur ON ur.user_id = cu.user_id
    WHERE (
      (periodo = 'diario' AND ur.created_at >= date_trunc('day', timezone('utc', now()))) OR
      (periodo = 'semanal' AND ur.created_at >= date_trunc('week', timezone('utc', now()))) OR
      (periodo = 'mensual' AND ur.created_at >= date_trunc('month', timezone('utc', now()))) OR
      (periodo = 'anual' AND ur.created_at >= date_trunc('year', timezone('utc', now()))) OR
      (periodo = 'historico')
    )
  )
  SELECT
    c.id AS club_id,
    c.nombre,
    c.logo_url,
    c.nivel,
    COUNT(DISTINCT cu.user_id)::integer AS miembros,
    COALESCE(SUM(am.distancia_km), 0)::numeric AS km_totales,
    COALESCE(SUM(am.tiempo_minutos), 0)::integer AS tiempo_total,
    COUNT(am.pts)::integer AS rutas_totales,
    COALESCE(SUM(am.pts), 0)::bigint AS puntos_periodo
  FROM public.clubs c
  LEFT JOIN public.clubs_usuarios cu ON cu.club_id = c.id
  LEFT JOIN actividades_miembros am ON am.club_id = c.id
  GROUP BY c.id, c.nombre, c.logo_url, c.nivel
  ORDER BY puntos_periodo DESC, miembros DESC
  LIMIT 50;
END;
$$;
