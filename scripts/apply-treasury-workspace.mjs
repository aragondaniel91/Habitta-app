import { readFileSync, writeFileSync } from 'node:fs';

const replaceOnce = (source, search, replacement, label) => {
  const occurrences = source.split(search).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: expected one match, found ${occurrences}`);
  }
  return source.replace(search, replacement);
};

const update = (path, transform) => {
  const source = readFileSync(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`${path}: no changes applied`);
  writeFileSync(path, next);
};

update('apps/api/src/index.ts', (source) => {
  let next = replaceOnce(
    source,
    "import { privateDocumentRoutes } from './private-document-routes';\n",
    "import { privateDocumentRoutes } from './private-document-routes';\nimport { treasuryRoutes } from './treasury-routes';\n",
    'api treasury import',
  );
  next = replaceOnce(
    next,
    "app.route('/v1/condominiums', privateDocumentRoutes);\n",
    "app.route('/v1/condominiums', privateDocumentRoutes);\napp.route('/v1/condominiums', treasuryRoutes);\n",
    'api treasury mount',
  );
  return next;
});

update('apps/web/src/navigation.ts', (source) => {
  let next = replaceOnce(
    source,
    "    | 'expenses'\n    | 'reports'",
    "    | 'expenses'\n    | 'treasury'\n    | 'reports'",
    'treasury route key',
  );
  next = replaceOnce(
    next,
    "  {\n    key: 'reports',\n",
    "  {\n    key: 'treasury',\n    path: '/app/treasury',\n    label: 'Tesorería',\n    shortLabel: 'Tesorería',\n    title: 'Tesorería',\n    description: 'Controla cuentas, cajas, movimientos, transferencias y conciliaciones por moneda.',\n    section: 'finanzas',\n    icon: PaymentsIcon,\n    scope: ['Cuentas y cajas', 'Movimientos', 'Conciliación bancaria'],\n  },\n  {\n    key: 'reports',\n",
    'treasury navigation entry',
  );
  return next;
});

update('apps/web/src/App.tsx', (source) => {
  let next = replaceOnce(
    source,
    "import { TeamAccessPage } from './pages/TeamAccessPage';\n",
    "import { TeamAccessPage } from './pages/TeamAccessPage';\nimport { TreasuryPage } from './pages/TreasuryPage';\n",
    'treasury page import',
  );
  next = replaceOnce(
    next,
    "  } else if (currentRoute.key === 'reports') {\n",
    "  } else if (currentRoute.key === 'treasury') {\n    page = (\n      <TreasuryPage\n        condominiumId={selectedCondominiumId}\n        condominiumName={condominiumName}\n        session={session}\n      />\n    );\n  } else if (currentRoute.key === 'reports') {\n",
    'treasury page route',
  );
  return next;
});

update('apps/web/src/main.tsx', (source) =>
  replaceOnce(
    source,
    "import './expenses.css';\n",
    "import './expenses.css';\nimport './treasury.css';\n",
    'treasury css import',
  ),
);

update('apps/web/src/features/help/module-help.ts', (source) =>
  replaceOnce(
    source,
    "  reports: {\n",
    "  treasury: {\n    purpose:\n      'Controla dónde se encuentran los fondos del condominio y compara el libro de Habitta con bancos y cajas sin mezclar monedas.',\n    actions: [\n      'Crear cuentas bancarias y cajas por moneda.',\n      'Registrar depósitos, retiros, comisiones, ajustes y transferencias internas.',\n      'Reversar movimientos sin borrar el historial y cerrar conciliaciones.',\n    ],\n    steps: [\n      'Registra cada cuenta con su moneda correcta.',\n      'Carga el saldo inicial antes del primer movimiento.',\n      'Concilia cada período contra el estado de cuenta del banco.',\n    ],\n    tips: [\n      'Una transferencia interna no es un ingreso ni un gasto.',\n      'Las operaciones entre monedas diferentes requieren un flujo de cambio separado.',\n      'Los movimientos confirmados se corrigen con reversos, nunca eliminándolos.',\n    ],\n    permissions: 'Administradores y contadores autorizados gestionan Tesorería; otros roles financieros pueden consultar según sus permisos.',\n  },\n  reports: {\n",
    'treasury help entry',
  ),
);
