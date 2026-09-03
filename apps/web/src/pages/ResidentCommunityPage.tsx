import type { Session } from '@supabase/supabase-js';
import {
  AnnouncementsIcon,
  ArrowRightIcon,
  CommunityIcon,
  RequestsIcon,
  VoteIcon,
} from '../components/icons';
import { PageHeader } from '../components/PageHeader';
import { Button, Surface } from '../components/ui';
import { canAccessRoute, useCondominiumRoles } from '../lib/roles';
import { APP_ROUTES, type AppRoute } from '../navigation';
import '../resident-community.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
  onNavigate: (route: AppRoute) => void;
};

type CommunityDestination = {
  key: AppRoute['key'];
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof CommunityIcon;
};

const destinations: CommunityDestination[] = [
  {
    key: 'announcements',
    eyebrow: 'Mantente al día',
    title: 'Anuncios',
    description: 'Comunicados oficiales y novedades importantes de tu comunidad.',
    icon: AnnouncementsIcon,
  },
  {
    key: 'documents',
    eyebrow: 'Información útil',
    title: 'Documentos',
    description: 'Consulta reglamentos, circulares y archivos compartidos contigo.',
    icon: CommunityIcon,
  },
  {
    key: 'requests',
    eyebrow: 'Atención',
    title: 'Solicitudes',
    description: 'Reporta una situación y sigue su atención sin perder el contexto.',
    icon: RequestsIcon,
  },
  {
    key: 'governance',
    eyebrow: 'Participación',
    title: 'Votaciones',
    description: 'Revisa propuestas y participa cuando tu rol tenga derecho a hacerlo.',
    icon: VoteIcon,
  },
];

const routeByKey = (key: AppRoute['key']) => APP_ROUTES.find((route) => route.key === key);

export function ResidentCommunityPage({ condominiumName, onNavigate }: Props) {
  const roles = useCondominiumRoles();
  const availableDestinations = destinations.flatMap((destination) => {
    const route = routeByKey(destination.key);
    return route && canAccessRoute(route, roles) ? [{ destination, route }] : [];
  });
  const announcements = availableDestinations.find(({ route }) => route.key === 'announcements');
  const requests = availableDestinations.find(({ route }) => route.key === 'requests');

  return (
    <div className="resident-community">
      <PageHeader
        actions={
          <>
            {requests ? (
              <Button onClick={() => onNavigate(requests.route)} size="sm" variant="secondary">
                Mis solicitudes
              </Button>
            ) : null}
            {announcements ? (
              <Button onClick={() => onNavigate(announcements.route)} size="sm">
                Ver anuncios
              </Button>
            ) : null}
          </>
        }
        description={`${condominiumName} · información, atención y participación en un solo lugar.`}
        eyebrow="Mi comunidad"
        title="Comunidad"
      />

      <Surface className="resident-community__intro">
        <span className="resident-community__intro-icon">
          <CommunityIcon size={22} />
        </span>
        <div>
          <span className="hq-kicker">Tu espacio comunitario</span>
          <h2>Lo importante, sin herramientas de administración</h2>
          <p>
            Accede únicamente a los espacios habilitados para tu rol. Habitta mantiene la gestión
            interna del condominio separada de tu experiencia como residente.
          </p>
        </div>
      </Surface>

      <section aria-label="Accesos de mi comunidad" className="resident-community__grid">
        {availableDestinations.map(({ destination, route }) => {
          const Icon = destination.icon;
          return (
            <button
              className="resident-community__destination"
              key={route.key}
              onClick={() => onNavigate(route)}
              type="button"
            >
              <span className="resident-community__destination-icon">
                <Icon size={20} />
              </span>
              <span className="resident-community__destination-copy">
                <small>{destination.eyebrow}</small>
                <strong>{destination.title}</strong>
                <p>{destination.description}</p>
              </span>
              <ArrowRightIcon size={18} />
            </button>
          );
        })}
      </section>
    </div>
  );
}
