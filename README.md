# PaddleSafe - Private Audits & Internal Architecture Specifications (Branch: `private-audits`)

Esta rama está reservada **exclusiva y privadamente** para:
- Auditorías técnicas y de seguridad de PaddleSafe.
- Informes de análisis y remediación estática.
- Especificaciones de arquitectura del motor náutico y meteorológico.
- Revisiones de consenso y modelos de abatimiento / deriva.

---

## 🔒 Confidencialidad y Aislamiento

- **No desplegar en Hostinger**: La rama de producción pública en Hostinger es `frontend-deploy`.
- **Exclusión total en el frontend**: Todos los archivos `.md` de auditoría han sido removidos de la rama de despliegue para garantizar que ninguna información interna, ruta o diagnóstico quede expuesta públicamente.
- **Acceso restringido**: Esta documentación permanece en esta rama privada para uso exclusivo del equipo técnico y auditoría interna.

---

## 📚 Documentos Archivados en esta Rama

- [`AUDITORIA-TECNICA.md`](AUDITORIA-TECNICA.md): Auditoría técnica completa de frontend, backend y flujos de usuario.
- [`PADDLESAFE_AUDIT.md`](PADDLESAFE_AUDIT.md): Diagnóstico exhaustivo de componentes, fallbacks y arquitectura.
- [`OPEN_METEO_MARINE_REVIEW.md`](OPEN_METEO_MARINE_REVIEW.md): Análisis técnico de variables marítimas y reintentos.
- [`PADDLESAFE_AI_COACH_PRO.md`](PADDLESAFE_AI_COACH_PRO.md): Especificación del motor inteligente de recomendaciones náuticas.
- [`PADDLESAFE_CONSENSUS_ENGINE.md`](PADDLESAFE_CONSENSUS_ENGINE.md): Algoritmo de consenso y pesos entre múltiples fuentes meteorológicas.
- [`PADDLESAFE_DRIFT_INDEX.md`](PADDLESAFE_DRIFT_INDEX.md): Fórmulas de cálculo de deriva, viento y resistencia hidrodinámica.
