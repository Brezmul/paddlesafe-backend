-- ==============================================================================
-- PADDLESAFE - PARCHE 2: SINCRONIZACIÓN AUTOMÁTICA DE GAMIFICACIÓN DESDE 'rutas'
-- Sincroniza atómicamente 'public.perfiles' tras INSERT o DELETE en 'public.rutas'
-- Unifica: km_totales = total_distance_km, puntos = total_xp, nivel = current_level
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.actualizar_gamificacion_desde_rutas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nuevo_xp integer;
  v_nuevo_km numeric;
  v_nuevo_nivel integer;
  v_nuevo_titulo text;
  v_target_user uuid;
  v_xp_delta integer;
  v_km_delta numeric;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_target_user := NEW.user_id;
    v_km_delta := COALESCE(NEW.distancia_km, 0);

    -- Puntos calculados de la ruta (points_earned, xp_earned o fórmula estándar PaddleSafe: km*10 + min)
    v_xp_delta := COALESCE(
      NULLIF((to_jsonb(NEW) ->> 'points_earned')::numeric, NULL)::integer,
      NULLIF((to_jsonb(NEW) ->> 'xp_earned')::numeric, NULL)::integer,
      (ROUND(v_km_delta * 10) + COALESCE(NEW.tiempo_minutos, 0))::integer
    );

    SELECT 
      COALESCE(total_xp, puntos, 0) + v_xp_delta,
      ROUND((COALESCE(total_distance_km, km_totales, 0) + v_km_delta)::numeric, 2)
    INTO v_nuevo_xp, v_nuevo_km
    FROM public.perfiles
    WHERE id = v_target_user;

  ELSIF TG_OP = 'DELETE' THEN
    v_target_user := OLD.user_id;
    v_km_delta := COALESCE(OLD.distancia_km, 0);

    v_xp_delta := COALESCE(
      NULLIF((to_jsonb(OLD) ->> 'points_earned')::numeric, NULL)::integer,
      NULLIF((to_jsonb(OLD) ->> 'xp_earned')::numeric, NULL)::integer,
      (ROUND(v_km_delta * 10) + COALESCE(OLD.tiempo_minutos, 0))::integer
    );

    SELECT 
      GREATEST(0, COALESCE(total_xp, puntos, 0) - v_xp_delta),
      GREATEST(0, ROUND((COALESCE(total_distance_km, km_totales, 0) - v_km_delta)::numeric, 2))
    INTO v_nuevo_xp, v_nuevo_km
    FROM public.perfiles
    WHERE id = v_target_user;
  END IF;

  IF v_target_user IS NOT NULL THEN
    -- Fórmula universal de nivel de PaddleSafe: floor(sqrt(total_xp / 100)) + 1
    v_nuevo_nivel := GREATEST(1, FLOOR(SQRT(COALESCE(v_nuevo_xp, 0)::numeric / 100)) + 1);

    -- Asignación de título dinámico según nivel
    BEGIN
      v_nuevo_titulo := public.calcular_titulo_paddler(v_nuevo_nivel);
    EXCEPTION WHEN OTHERS THEN
      v_nuevo_titulo := CASE v_nuevo_nivel
        WHEN 1 THEN 'Paddler en Ascenso'
        WHEN 2 THEN 'Paddler Costero'
        WHEN 3 THEN 'Paddler de Aguas Tranquilas'
        WHEN 4 THEN 'Paddler de Touring'
        WHEN 5 THEN 'Paddler de Race'
        WHEN 6 THEN 'Paddler de Downwind'
        WHEN 7 THEN 'Paddler Oceánico'
        WHEN 8 THEN 'Paddler de Marejada'
        WHEN 9 THEN 'Paddler de Rompientes'
        ELSE 'Maestro del SUP'
      END;
    END;

    -- Actualización unificada en perfiles asegurando ambas nomenclaturas
    UPDATE public.perfiles
    SET 
      total_xp = v_nuevo_xp,
      puntos = v_nuevo_xp,
      total_distance_km = v_nuevo_km,
      km_totales = v_nuevo_km,
      current_level = v_nuevo_nivel,
      nivel = v_nuevo_nivel,
      titulo = COALESCE(v_nuevo_titulo, titulo)
    WHERE id = v_target_user;
  END IF;

  RETURN NULL;
END;
$$;

-- Trigger idempotente en public.rutas
DROP TRIGGER IF EXISTS trg_actualizar_gamificacion_desde_rutas ON public.rutas;
CREATE TRIGGER trg_actualizar_gamificacion_desde_rutas
AFTER INSERT OR DELETE ON public.rutas
FOR EACH ROW EXECUTE FUNCTION public.actualizar_gamificacion_desde_rutas();

