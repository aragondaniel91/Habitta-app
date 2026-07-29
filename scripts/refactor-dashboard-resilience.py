from pathlib import Path

path = Path('apps/web/src/pages/AdministrativeDashboard.tsx')
value = path.read_text()

import_anchor = "import type { AppRoute } from '../navigation';\n"
import_line = "import { buildDashboardSourceWarning, settleDashboardSource } from '../lib/dashboard-sources';\n"
if import_line not in value:
    value = value.replace(import_anchor, import_anchor + import_line)

start = value.index('  const load = useCallback(async () => {')
end_marker = '  }, [condominiumId, session]);'
end = value.index(end_marker, start) + len(end_marker)
replacement = Path('scripts/dashboard-load-replacement.txt').read_text()
path.write_text(value[:start] + replacement + value[end:])
