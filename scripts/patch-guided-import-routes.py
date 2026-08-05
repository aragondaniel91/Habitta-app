from pathlib import Path

path = Path("apps/api/src/index.ts")
source = path.read_text()

import_marker = "import { operationsRoutes } from './operations-routes';\n"
import_replacement = (
    "import { operationsRoutes } from './operations-routes';\n"
    "import { importRoutes } from './import-routes';\n"
)
route_marker = "app.route('/v1/condominiums', operationsRoutes);\n"
route_replacement = (
    "app.route('/v1/condominiums', operationsRoutes);\n"
    "app.route('/v1/condominiums', importRoutes);\n"
)

if "import { importRoutes } from './import-routes';" not in source:
    if import_marker not in source:
        raise SystemExit("Import marker not found")
    source = source.replace(import_marker, import_replacement, 1)

if "app.route('/v1/condominiums', importRoutes);" not in source:
    if route_marker not in source:
        raise SystemExit("Route marker not found")
    source = source.replace(route_marker, route_replacement, 1)

path.write_text(source)
