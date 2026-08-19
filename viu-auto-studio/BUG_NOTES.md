# BUG: POST /api/projects body param resolves as Query

FastAPI dependency inspection shows `/projects POST` has `query: data` while every sibling POST
(`/channels`, `/projects/{id}`, `/projects/{id}/duplicate`, `/projects/{id}/script`,
`/projects/{id}/scenes`, `/projects/{id}/scenes/reorder`, `/projects/{id}/scenes/{id}/split`,
`/projects/{id}/scenes/{id}/media`, `/projects/{id}/scenes/{id}/regenerate-voice`,
`/subtitle-preview`, `/render/start`) correctly has `body: payload Body`.

The ONLY structural difference: `create_project` is the only endpoint whose Pydantic
model parameter comes BEFORE a `Depends()` parameter AND uses the V2 schema
(`ProjectCreateV2`), and it's the first POST in the router. Most likely cause:
`ProjectCreateV2` was NOT imported in routes.py (only `ProjectCreate` was imported),
so FastAPI's ForwardRef resolution silently failed and fell back to treating it as a
Query param. Even after adding the import, the running server showed the old behavior
(but the inspector run after the import re-check is pending).

FIX PLAN:
1. Verify `ProjectCreateV2` is now imported at line 24 of backend/api/routes.py (added via sed earlier).
2. Add explicit `= Body(...)` to remove any ambiguity: `def create_project(data: ProjectCreateV2 = Body(...), db: Session = Depends(get_db)):`
3. Re-run /tmp/inspect_deps.py to confirm `body: data Body`.
4. Test curl POST with flat JSON body → 201.
5. Update frontend api.ts createProject to include project_type: "ai_studio" and output_folder.
6. Also check other POST endpoints for unimported schema models (e.g., TTSSynthesizeRequest, ScriptGenerateRequest etc.) — quick grep of all payload type annotations vs imports.
