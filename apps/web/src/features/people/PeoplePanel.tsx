import { useState } from 'react';

export function PeoplePanel() {
  const [query, setQuery] = useState('');
  return (
    <section className="people-panel">
      <h2>Personas</h2>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar por nombre, correo, teléfono o unidad"
      />
      <p>
        {query
          ? 'La búsqueda se aplicará al cargar las personas del condominio.'
          : 'Aún no hay personas para mostrar.'}
      </p>
      <a href="/templates/habitta-people-import.csv" download>
        Descargar plantilla CSV
      </a>
    </section>
  );
}
