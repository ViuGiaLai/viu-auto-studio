from backend.main import app

for route in app.routes:
    path = getattr(route, "path", "")
    methods = sorted(getattr(route, "methods", set()))
    if "pipeline" in path or path.endswith("/projects/{project_id}"):
        print(methods, path)
