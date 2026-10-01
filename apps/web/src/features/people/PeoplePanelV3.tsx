import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ConfirmDialog } from '../../components/Dialog';
import { PageHeader } from '../../components/PageHeader';
import {
  InlineNotice,
  WorkspaceMetricCard,
  WorkspaceMetrics,
  WorkspaceSection,
} from '../../components/WorkspaceUi';
import { BellIcon, CheckCircleIcon, PeopleIcon, UnitsIcon } from '../../components/icons';
import { Badge, Button, EmptyState, Field, Select, Skeleton, Surface } from '../../components/ui';
import {
  createResidentInvitation,
  listResidentInvitationDeliveryEvents,
  listResidentInvitations,
  residentDeliveryLabel,
  residentRoleLabel,
  revokeResidentInvitation,
  type ResidentInvitation,
  type ResidentInvitationDelivery,
  type ResidentInvitationDeliveryEvent,
  type ResidentRole,
} from '../../lib/residentAccess';
import { peopleApi } from './api';
import { buildPersonUnitRelationships } from './person-unit-relationships';
import type { PersonUnitRelationshipSummary } from './person-unit-relationships';
import { PersonEditorDrawerV3 } from './PersonEditorDrawerV3';
import { PeopleImportDrawerV3 } from './PeopleImportDrawerV3';
import { PersonRelationshipHistoryDrawerV3 } from './PersonRelationshipHistoryDrawerV3';
import { PersonRequestOwnership, shouldShowInitialProfileSkeleton } from './request-ownership';
import { PersonUnitRelationshipDrawerV3 } from './PersonUnitRelationshipDrawerV3';
import {
  PeopleDirectoryView,
  PeopleProfileEmpty,
  PersonProfileHeader,
  PersonUnitRelationshipCard,
  type DirectorySelectionInteraction,
  type PeopleProfileTab,
} from './PeopleWorkspaceComponents';
import {
  condominiumRelationshipLabels,
  directoryUnitLabel,
  personSearchText,
  residentAccessOptions,
  residentInvitationDisplayStatus,
  residentInvitationStatusLabels,
} from './relationship-model';
import type {
  Building,
  CommunicationAssignment,
  CommunicationResponsibilitiesView,
  CondominiumRelationship,
  CondominiumRelationshipType,
  Occupancy,
  Ownership,
  Person,
  PersonAdminNoteRevision,
  PersonAdminNotesView,
  PersonRelationshipView,
  Unit,
} from './types';
import './people-v3.css';

type Props = {
  condominiumId: string;
  condominiumName: string;
  session: Session;
};

type PendingClose =
  | { kind: 'ownership'; id: string; label: string }
  | { kind: 'occupancy'; id: string; label: string }
  | { kind: 'condominium'; id: string; label: string }
  | null;

type LatestInvitation = {
  url: string;
  role: ResidentRole;
  unitLabel: string;
  delivery: ResidentInvitationDelivery;
};

type InvitationListReloadRetry = {
  personId: string;
  selectionVersion: number;
  successMessage: string;
  error: string;
};

type PendingProfileReveal = {
  personId: string;
  selectionVersion: number;
  interaction: DirectorySelectionInteraction;
};

const profileRevealTolerance = 24;

function profileRevealHasSettled(profile: HTMLElement) {
  const scrollMarginTop = Number.parseFloat(window.getComputedStyle(profile).scrollMarginTop);
  if (!Number.isFinite(scrollMarginTop)) return false;

  return Math.abs(profile.getBoundingClientRect().top - scrollMarginTop) <= profileRevealTolerance;
}

function profileRevealScrollTarget(profile: HTMLElement) {
  const scrollMarginTop = Number.parseFloat(window.getComputedStyle(profile).scrollMarginTop);
  if (!Number.isFinite(scrollMarginTop)) return null;

  return window.scrollY + profile.getBoundingClientRect().top - scrollMarginTop;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value));
}

function invitationTone(status: ResidentInvitation['status']) {
  if (status === 'accepted') return 'success' as const;
  if (status === 'pending') return 'info' as const;
  if (status === 'expired') return 'warning' as const;
  return 'neutral' as const;
}

function deliveryTone(event?: ResidentInvitationDeliveryEvent) {
  if (event?.event_type === 'email_sent') return 'success' as const;
  if (event?.event_type === 'email_failed') return 'warning' as const;
  return 'neutral' as const;
}

export function PeoplePanelV3({ condominiumId, condominiumName, session }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selected, setSelected] = useState<Person | null>(null);
  const [ownerships, setOwnerships] = useState<Ownership[]>([]);
  const [occupancies, setOccupancies] = useState<Occupancy[]>([]);
  const [communicationAssignments, setCommunicationAssignments] = useState<
    CommunicationAssignment[]
  >([]);
  const [condominiumRelationships, setCondominiumRelationships] = useState<
    CondominiumRelationship[]
  >([]);
  const [invitations, setInvitations] = useState<ResidentInvitation[]>([]);
  const [deliveryEvents, setDeliveryEvents] = useState<ResidentInvitationDeliveryEvent[]>([]);
  const [adminNoteRevisions, setAdminNoteRevisions] = useState<PersonAdminNoteRevision[]>([]);
  const [adminNotesAuthorized, setAdminNotesAuthorized] = useState(false);
  const [adminNoteDraft, setAdminNoteDraft] = useState('');
  const [adminNoteError, setAdminNoteError] = useState('');

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tab, setTab] = useState<PeopleProfileTab>('summary');
  const [loading, setLoading] = useState(true);
  const [directoryLoadError, setDirectoryLoadError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  // Detail refreshes are deliberately non-destructive.  Once a profile has loaded,
  // retain its controls and form fields while a later request is in flight.
  const [hasLoadedSelectedProfile, setHasLoadedSelectedProfile] = useState(false);
  const [error, setError] = useState('');
  // Only a failed profile request is retryable. Mutation and validation errors must
  // remain visible without invalidating the operation that produced them.
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [message, setMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const [personEditor, setPersonEditor] = useState<'create' | 'edit' | null>(null);
  const [relationTarget, setRelationTarget] = useState<{ unitId?: string } | null>(null);
  const [historyRelationship, setHistoryRelationship] =
    useState<PersonUnitRelationshipSummary | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingClose, setPendingClose] = useState<PendingClose>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ResidentInvitation | null>(null);

  const [relationshipDraft, setRelationshipDraft] = useState({
    relationshipType: 'board_member' as CondominiumRelationshipType,
    title: '',
  });
  const [inviteRole, setInviteRole] = useState<ResidentRole>('owner');
  const [inviteUnitId, setInviteUnitId] = useState('');
  const [latestInvitation, setLatestInvitation] = useState<LatestInvitation | null>(null);
  const [invitationListReloadRetry, setInvitationListReloadRetry] =
    useState<InvitationListReloadRetry | null>(null);
  const [auditPersistenceWarning, setAuditPersistenceWarning] = useState('');
  // A profile operation belongs to the selection that started it.  Refs are used here
  // rather than state so that completions can be rejected before they enqueue updates.
  const selectionVersionRef = useRef(0);
  const requestOwnershipRef = useRef(new PersonRequestOwnership());
  const selectedPersonIdRef = useRef<string | null>(null);
  const profileLoadVersionRef = useRef(0);
  // Keep the error's load token separate from non-profile errors so that a
  // succeeding profile load clears only retryable profile feedback.
  const profileErrorLoadVersionRef = useRef<number | null>(null);
  // Mutations are independently owned.  A single global "latest operation" makes
  // two legitimate same-person mutations cancel one another and can strand a busy
  // indicator, so retain each in-flight operation until it finishes or selection changes.
  const operationNonceRef = useRef(0);
  const activeOperationsRef = useRef(new Map<number, string>());
  const adminNoteInputRef = useRef<HTMLTextAreaElement>(null);
  const profileRevealRef = useRef<HTMLDivElement>(null);
  const profileHeadingRef = useRef<HTMLHeadingElement>(null);
  const profileRevealFrameRef = useRef<number | null>(null);
  const profileFocusCleanupRef = useRef<(() => void) | null>(null);

  const clearPersonState = useCallback(() => {
    requestOwnershipRef.current.clear();
    activeOperationsRef.current.clear();
    profileErrorLoadVersionRef.current = null;
    setOwnerships([]);
    setOccupancies([]);
    setCommunicationAssignments([]);
    setCondominiumRelationships([]);
    setInvitations([]);
    setDeliveryEvents([]);
    setAdminNoteRevisions([]);
    setAdminNotesAuthorized(false);
    setAdminNoteDraft('');
    setAdminNoteError('');
    setDetailLoading(false);
    setHasLoadedSelectedProfile(false);
    setBusyAction('');
    setError('');
    setProfileLoadError(false);
    setMessage('');
    setLatestInvitation(null);
    setInvitationListReloadRetry(null);
    setAuditPersistenceWarning('');
    setRelationTarget(null);
    setHistoryRelationship(null);
    setPendingClose(null);
    setPendingRevoke(null);
  }, []);

  const ownsSelection = useCallback(
    (personId: string, selectionVersion: number) =>
      selectedPersonIdRef.current === personId &&
      selectionVersionRef.current === selectionVersion &&
      requestOwnershipRef.current.ownsSelection(personId, selectionVersion),
    [],
  );

  const cancelPendingProfileReveal = useCallback(() => {
    if (profileRevealFrameRef.current !== null) {
      const cancelFrame = window.cancelAnimationFrame ?? window.clearTimeout;
      cancelFrame(profileRevealFrameRef.current);
      profileRevealFrameRef.current = null;
    }
    profileFocusCleanupRef.current?.();
    profileFocusCleanupRef.current = null;
  }, []);

  const scheduleProfileReveal = useCallback(
    ({ personId, selectionVersion, interaction }: PendingProfileReveal) => {
      cancelPendingProfileReveal();
      if (typeof window === 'undefined' || !window.matchMedia?.('(max-width: 860px)').matches) {
        return;
      }

      const requestFrame =
        window.requestAnimationFrame ??
        ((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
      profileRevealFrameRef.current = requestFrame(() => {
        profileRevealFrameRef.current = null;
        if (!ownsSelection(personId, selectionVersion)) return;

        const profile = profileRevealRef.current;
        if (!profile) return;
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const revealProfile = (behavior: ScrollBehavior) => {
          const target = profileRevealScrollTarget(profile);
          if (target === null) {
            profile.scrollIntoView({ behavior, block: 'start' });
            return;
          }

          // Native scrollIntoView can settle short of the profile's scroll margin after
          // either pointer or keyboard selection. Use the measured document offset so
          // both interactions land below the fixed top bar.
          window.scrollTo({ behavior, top: target });
        };
        revealProfile(reducedMotion ? 'auto' : 'smooth');

        if (interaction !== 'keyboard' && !reducedMotion) {
          const cleanupPointerFallback = () => window.clearTimeout(fallbackTimer);
          const fallbackTimer = window.setTimeout(() => {
            // A pointer click retains focus in the directory, so it has no focus
            // completion event. Correct an interrupted smooth scroll after it has
            // had a chance to settle.
            if (ownsSelection(personId, selectionVersion) && !profileRevealHasSettled(profile)) {
              revealProfile('auto');
            }
            if (profileFocusCleanupRef.current === cleanupPointerFallback) {
              profileFocusCleanupRef.current = null;
            }
          }, 1000);
          profileFocusCleanupRef.current = cleanupPointerFallback;
        } else if (interaction === 'keyboard') {
          const focusProfileHeading = () => {
            if (!ownsSelection(personId, selectionVersion)) return;
            profileHeadingRef.current?.focus({ preventScroll: true });
          };

          if (reducedMotion) {
            focusProfileHeading();
            return;
          }

          const completeProfileReveal = (forceFocus = false) => {
            // Focus can cause its own scroll. Ignore an earlier scrollend until the
            // profile anchor has reached the same margin used by scrollIntoView.
            if (!forceFocus && !profileRevealHasSettled(profile)) {
              revealProfile('smooth');
              return false;
            }

            profileFocusCleanupRef.current?.();
            focusProfileHeading();
            return true;
          };
          const onScrollEnd = () => {
            completeProfileReveal();
          };
          const fallbackTimer = window.setTimeout(() => {
            // Do not let the focus fallback mask an incomplete reveal. A final
            // instant correction gives keyboard users the same anchored result if a
            // browser does not deliver a usable scrollend event.
            revealProfile('auto');
            completeProfileReveal(true);
          }, 1000);
          window.addEventListener('scrollend', onScrollEnd);
          profileFocusCleanupRef.current = () => {
            window.removeEventListener('scrollend', onScrollEnd);
            window.clearTimeout(fallbackTimer);
          };
        }
      });
    },
    [cancelPendingProfileReveal, ownsSelection],
  );

  useEffect(
    () => cancelPendingProfileReveal,
    [cancelPendingProfileReveal],
  );
  const ownsProfileLoad = useCallback(
    (personId: string, selectionVersion: number, loadVersion: number) =>
      ownsSelection(personId, selectionVersion) && profileLoadVersionRef.current === loadVersion,
    [ownsSelection],
  );
  const showProfileLoadError = useCallback(
    (personId: string, selectionVersion: number, loadVersion: number, requestError: unknown) => {
      if (!ownsProfileLoad(personId, selectionVersion, loadVersion)) return;
      profileErrorLoadVersionRef.current = loadVersion;
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar el perfil de la persona.',
      );
      setProfileLoadError(true);
    },
    [ownsProfileLoad],
  );
  const clearProfileLoadFeedback = useCallback(() => {
    profileErrorLoadVersionRef.current = null;
    setProfileLoadError(false);
  }, []);
  const showActionError = useCallback(
    (actionError: string) => {
      clearProfileLoadFeedback();
      setInvitationListReloadRetry(null);
      setAuditPersistenceWarning('');
      setError(actionError);
    },
    [clearProfileLoadFeedback],
  );
  const clearActionFeedback = useCallback(() => {
    clearProfileLoadFeedback();
    setInvitationListReloadRetry(null);
    setAuditPersistenceWarning('');
    setError('');
  }, [clearProfileLoadFeedback]);
  const beginOperation = useCallback((label: string) => {
    const operationId = ++operationNonceRef.current;
    activeOperationsRef.current.set(operationId, label);
    setBusyAction(label);
    return operationId;
  }, []);
  const ownsOperation = useCallback(
    (personId: string, selectionVersion: number, operationId: number) =>
      ownsSelection(personId, selectionVersion) && activeOperationsRef.current.has(operationId),
    [ownsSelection],
  );
  const finishOperation = useCallback((operationId: number) => {
    activeOperationsRef.current.delete(operationId);
    setBusyAction(Array.from(activeOperationsRef.current.values()).at(-1) ?? '');
  }, []);

  const loadDirectory = useCallback(
    async (clearFeedback = true) => {
      setLoading(true);
      if (clearFeedback) {
        setError('');
        clearProfileLoadFeedback();
        setDirectoryLoadError('');
      }
      try {
        const [peopleItems, unitItems, buildingItems] = await Promise.all([
          peopleApi<Person[]>(`/v1/condominiums/${condominiumId}/people`, session),
          peopleApi<Unit[]>(`/v1/condominiums/${condominiumId}/units`, session),
          peopleApi<Building[]>(`/v1/condominiums/${condominiumId}/buildings`, session),
        ]);
        setPeople(peopleItems);
        setUnits(unitItems);
        setBuildings(buildingItems);
        setDirectoryLoadError('');
        setSelected((current) =>
          current ? (peopleItems.find((person) => person.id === current.id) ?? current) : current,
        );
        return null;
      } catch (requestError) {
        const directoryError =
          requestError instanceof Error ? requestError.message : 'No se pudo cargar Personas.';
        clearProfileLoadFeedback();
        setDirectoryLoadError(directoryError);
        setError('');
        return directoryError;
      } finally {
        setLoading(false);
      }
    },
    [clearProfileLoadFeedback, condominiumId, session],
  );

  const loadPersonContext = useCallback(
    async (personId: string, selectionVersion: number, loadVersion: number) => {
      const [view, communicationsView, invitationItems, deliveryItems, notesView] =
        await Promise.all([
          peopleApi<PersonRelationshipView>(
            `/v1/condominiums/${condominiumId}/people/${personId}/relationships`,
            session,
          ),
          peopleApi<CommunicationResponsibilitiesView>(
            `/v1/condominiums/${condominiumId}/people/${personId}/communication-responsibilities`,
            session,
          ),
          listResidentInvitations(condominiumId, personId),
          listResidentInvitationDeliveryEvents(condominiumId, personId),
          peopleApi<PersonAdminNotesView>(
            `/v1/condominiums/${condominiumId}/people/${personId}/admin-notes`,
            session,
          ),
        ]);

      if (!ownsProfileLoad(personId, selectionVersion, loadVersion)) return false;
      if (profileErrorLoadVersionRef.current !== null) {
        profileErrorLoadVersionRef.current = null;
        setError('');
      }
      setProfileLoadError(false);
      setSelected(view.person);
      setOwnerships(view.ownerships);
      setOccupancies(view.occupancies);
      setCommunicationAssignments(communicationsView.assignments);
      setCondominiumRelationships(view.condominiumRelationships);
      setInvitations(invitationItems);
      setDeliveryEvents(deliveryItems);
      setAdminNotesAuthorized(notesView.authorized);
      setAdminNoteRevisions(notesView.revisions);
      const currentNote = notesView.revisions[0];
      setAdminNoteDraft(
        currentNote?.action === 'saved' && currentNote.content ? currentNote.content : '',
      );
      setHasLoadedSelectedProfile(true);
      return true;
    },
    [condominiumId, ownsProfileLoad, session],
  );

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    selectionVersionRef.current += 1;
    selectedPersonIdRef.current = null;
    profileLoadVersionRef.current += 1;
    setSelected(null);
    clearPersonState();
    setTab('summary');
  }, [clearPersonState, condominiumId]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return people.filter((person) => {
      const matchesQuery = !normalizedQuery || personSearchText(person).includes(normalizedQuery);
      const status = person.status === 'inactive' ? 'inactive' : 'active';
      return matchesQuery && (!statusFilter || status === statusFilter);
    });
  }, [people, query, statusFilter]);

  const directoryEmptyState = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const queryMatches = normalizedQuery
      ? people.filter((person) => personSearchText(person).includes(normalizedQuery))
      : people;
    const filtersCauseNoResults =
      filtered.length === 0 && Boolean(statusFilter) && queryMatches.length > 0;

    if (directoryLoadError && people.length === 0) {
      return {
        title: 'No se pudo cargar el directorio',
        description: directoryLoadError,
        actionLabel: 'Reintentar',
        tone: 'error' as const,
      };
    }
    if (people.length === 0) {
      return {
        title: 'Aún no hay personas registradas',
        description: 'Cuando agregues Personas, aparecerán aquí.',
      };
    }
    if (filtersCauseNoResults) {
      return {
        title: 'Ninguna persona coincide con el filtro',
        description: 'Restablece el filtro de estado para ver más personas.',
        actionLabel: 'Restablecer filtro',
      };
    }
    return {
      title: 'No encontramos resultados para tu búsqueda',
      description: 'Prueba con otro nombre, documento, correo o teléfono.',
    };
  }, [directoryLoadError, filtered.length, people, query, statusFilter]);

  const accessOptions = useMemo(
    () => residentAccessOptions(ownerships, occupancies),
    [ownerships, occupancies],
  );

  const relationships = useMemo(
    () =>
      buildPersonUnitRelationships({
        units,
        buildings,
        ownerships,
        occupancies,
        communicationAssignments,
        invitations,
      }),
    [units, buildings, ownerships, occupancies, communicationAssignments, invitations],
  );

  const renderedSelectionVersion = selectionVersionRef.current;

  const deliveryByInvitationId = useMemo(() => {
    const latest = new Map<string, ResidentInvitationDeliveryEvent>();
    for (const event of deliveryEvents) {
      if (!latest.has(event.invitation_id)) latest.set(event.invitation_id, event);
    }
    return latest;
  }, [deliveryEvents]);

  const inviteUnits = accessOptions.filter((option) => option.role === inviteRole);

  useEffect(() => {
    setInviteUnitId((current) => {
      if (current && inviteUnits.some((option) => option.unitId === current)) return current;
      return inviteUnits[0]?.unitId ?? '';
    });
  }, [inviteRole, accessOptions]);

  const activePeople = people.filter((person) => person.status !== 'inactive').length;
  const connectedPeople = people.filter((person) => Boolean(person.email || person.phone)).length;
  const activeUnitRelationships = relationships.filter((relationship) => relationship.active);
  const activeCommunityRoles = condominiumRelationships.filter((item) => !item.ends_at);
  const pendingInvitations = invitations.filter(
    (invitation) => residentInvitationDisplayStatus(invitation) === 'pending',
  );

  const selectPerson = async (
    person: Person,
    interaction: DirectorySelectionInteraction = 'pointer',
  ) => {
    const personChanged = selected?.id !== person.id;
    if (personChanged) clearPersonState();
    const ownership = requestOwnershipRef.current.select(person.id);
    const selectionVersion = (selectionVersionRef.current = ownership.selectionVersion);
    const loadVersion = (profileLoadVersionRef.current = ownership.loadVersion);
    selectedPersonIdRef.current = person.id;
    setSelected(person);
    scheduleProfileReveal({ personId: person.id, selectionVersion, interaction });
    setDetailLoading(true);
    setError('');
    setProfileLoadError(false);
    profileErrorLoadVersionRef.current = null;
    setMessage('');
    setLatestInvitation(null);
    setTab('summary');
    try {
      await loadPersonContext(person.id, selectionVersion, loadVersion);
    } catch (requestError) {
      if (ownsProfileLoad(person.id, selectionVersion, loadVersion)) {
        showProfileLoadError(person.id, selectionVersion, loadVersion, requestError);
      }
    } finally {
      if (ownsProfileLoad(person.id, selectionVersion, loadVersion)) {
        setDetailLoading(false);
      }
    }
  };

  const refreshSelected = async (
    personId: string,
    selectionVersion: number,
    successMessage?: string,
    onLoadStarted?: (loadVersion: number) => void,
  ) => {
    if (!ownsSelection(personId, selectionVersion)) return false;
    const ownership = requestOwnershipRef.current.refresh(personId);
    if (!ownership || ownership.selectionVersion !== selectionVersion) return false;
    const loadVersion = (profileLoadVersionRef.current = ownership.loadVersion);
    onLoadStarted?.(loadVersion);
    setDetailLoading(true);
    try {
      const committed = await loadPersonContext(personId, selectionVersion, loadVersion);
      if (committed && successMessage) setMessage(successMessage);
      return committed;
    } finally {
      if (ownsProfileLoad(personId, selectionVersion, loadVersion)) {
        setDetailLoading(false);
      }
    }
  };

  const retrySelectedProfile = async (personId: string, selectionVersion: number) => {
    let loadVersion: number | null = null;
    try {
      await refreshSelected(personId, selectionVersion, undefined, (version) => {
        loadVersion = version;
      });
    } catch (requestError) {
      if (loadVersion === null || !ownsProfileLoad(personId, selectionVersion, loadVersion)) return;
      showProfileLoadError(personId, selectionVersion, loadVersion, requestError);
    }
  };

  const refreshAfterPersistedMutation = async (
    personId: string,
    selectionVersion: number,
    successMessage: string,
  ) => {
    let loadVersion: number | null = null;
    try {
      await refreshSelected(personId, selectionVersion, successMessage, (version) => {
        loadVersion = version;
      });
    } catch (requestError) {
      if (loadVersion === null || !ownsProfileLoad(personId, selectionVersion, loadVersion)) return;
      showProfileLoadError(personId, selectionVersion, loadVersion, requestError);
      setMessage(
        `${successMessage} El cambio se guardó correctamente, pero no se pudo recargar el perfil.`,
      );
    }
  };

  const reloadInvitationListsAfterPersistedMutation = async (
    personId: string,
    selectionVersion: number,
    successMessage: string,
  ) => {
    try {
      const [nextInvitations, nextDeliveryEvents] = await Promise.all([
        listResidentInvitations(condominiumId, personId),
        listResidentInvitationDeliveryEvents(condominiumId, personId),
      ]);
      if (!ownsSelection(personId, selectionVersion)) return false;
      setInvitations(nextInvitations);
      setDeliveryEvents(nextDeliveryEvents);
      setInvitationListReloadRetry(null);
      setMessage(successMessage);
      return true;
    } catch (requestError) {
      if (!ownsSelection(personId, selectionVersion)) return false;
      const reloadError =
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo recargar la lista de invitaciones.';
      setInvitationListReloadRetry({
        personId,
        selectionVersion,
        successMessage,
        error: `La invitación ya se guardó, pero no se pudo recargar la lista: ${reloadError}`,
      });
      setMessage(successMessage);
      return false;
    }
  };

  const retryInvitationListReload = async () => {
    if (!invitationListReloadRetry) return;
    await reloadInvitationListsAfterPersistedMutation(
      invitationListReloadRetry.personId,
      invitationListReloadRetry.selectionVersion,
      invitationListReloadRetry.successMessage,
    );
  };

  const handlePersonSaved = async (person: Person, successMessage: string) => {
    const selectionVersion = selectionVersionRef.current;
    const savedMode = personEditor;
    setPersonEditor(null);
    await loadDirectory(false);
    // A create selects its new person even if another profile was initially open.  In
    // either mode, a selection made while the directory was refreshing wins.
    if (selectionVersionRef.current !== selectionVersion) return;
    if (savedMode === 'edit' && selectedPersonIdRef.current !== person.id) return;
    const isSamePersonEdit = savedMode === 'edit' && selectedPersonIdRef.current === person.id;
    let nextSelectionVersion = selectionVersion;
    if (!isSamePersonEdit) {
      // Changing selection invalidates old request ownership before the saved person
      // becomes active. Same-person edits retain their profile and in-flight work.
      clearPersonState();
      const ownership = requestOwnershipRef.current.select(person.id);
      nextSelectionVersion = selectionVersionRef.current = ownership.selectionVersion;
      profileLoadVersionRef.current = ownership.loadVersion;
      selectedPersonIdRef.current = person.id;
    }
    setSelected(person);
    setTab('summary');
    let loadVersion: number | null = null;
    try {
      await refreshSelected(person.id, nextSelectionVersion, successMessage, (version) => {
        loadVersion = version;
      });
    } catch (requestError) {
      if (loadVersion !== null && ownsProfileLoad(person.id, nextSelectionVersion, loadVersion)) {
        showProfileLoadError(person.id, nextSelectionVersion, loadVersion, requestError);
        setMessage(
          `${successMessage} Se guardó correctamente, pero no se pudo recargar el perfil.`,
        );
      }
    }
  };

  const createCondominiumRelationship = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const personId = selected.id;
    const selectionVersion = selectionVersionRef.current;
    const operationId = beginOperation('condominium-relationship');
    clearActionFeedback();
    setMessage('');
    try {
      await peopleApi(
        `/v1/condominiums/${condominiumId}/people/${selected.id}/condominium-relationships`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({
            relationshipType: relationshipDraft.relationshipType,
            ...(relationshipDraft.title.trim() ? { title: relationshipDraft.title.trim() } : {}),
          }),
        },
      );
      if (!ownsOperation(personId, selectionVersion, operationId)) return;
      setRelationshipDraft({ relationshipType: 'board_member', title: '' });
      await refreshAfterPersistedMutation(
        personId,
        selectionVersion,
        'Relación con la comunidad agregada.',
      );
    } catch (requestError) {
      if (ownsOperation(personId, selectionVersion, operationId))
        showActionError(
          requestError instanceof Error ? requestError.message : 'No se pudo agregar la relación.',
        );
    } finally {
      finishOperation(operationId);
    }
  };

  const confirmCloseRelationship = async () => {
    if (!selected || !pendingClose) return;
    const personId = selected.id;
    const selectionVersion = selectionVersionRef.current;
    const operationId = beginOperation(`close:${pendingClose.id}`);
    clearActionFeedback();
    try {
      if (pendingClose.kind === 'condominium') {
        await peopleApi(
          `/v1/condominiums/${condominiumId}/people/${selected.id}/condominium-relationships/${pendingClose.id}`,
          session,
          {
            method: 'PATCH',
            body: JSON.stringify({ endsAt: new Date().toISOString().slice(0, 10) }),
          },
        );
      } else {
        await peopleApi(
          `/v1/condominiums/${condominiumId}/${pendingClose.kind === 'ownership' ? 'unit-owners' : 'unit-occupancies'}/${pendingClose.id}`,
          session,
          {
            method: 'PATCH',
            body: JSON.stringify({ endsAt: new Date().toISOString().slice(0, 10) }),
          },
        );
      }
      if (!ownsOperation(personId, selectionVersion, operationId)) return;
      setPendingClose(null);
      await refreshAfterPersistedMutation(
        personId,
        selectionVersion,
        'Relación cerrada. El historial se conserva y sigue siendo auditable.',
      );
    } catch (requestError) {
      if (ownsOperation(personId, selectionVersion, operationId))
        showActionError(
          requestError instanceof Error ? requestError.message : 'No se pudo cerrar la relación.',
        );
    } finally {
      finishOperation(operationId);
    }
  };

  const issueInvitation = async (role: ResidentRole, unitId: string) => {
    if (!selected || !unitId) return;
    const personId = selected.id;
    const selectionVersion = selectionVersionRef.current;
    if (!selected.email) {
      showActionError('Agrega un correo válido a la persona antes de invitarla.');
      return;
    }
    const option = accessOptions.find((item) => item.role === role && item.unitId === unitId);
    if (!option) {
      showActionError(
        'La relación activa ya no es compatible con ese acceso. Actualiza el perfil e intenta nuevamente.',
      );
      return;
    }
    const operationId = beginOperation('invitation');
    clearActionFeedback();
    setMessage('');
    setLatestInvitation(null);
    try {
      const result = await createResidentInvitation({
        condominiumId,
        personId: selected.id,
        unitId,
        role,
        session,
      });
      if (!ownsOperation(personId, selectionVersion, operationId)) return;
      setLatestInvitation({
        url: result.invitationUrl,
        role,
        unitLabel: option.unitLabel,
        delivery: result.emailDelivery,
      });
      const successMessage =
        result.emailDelivery.status === 'sent'
          ? result.emailDelivery.mode === 'sandbox'
            ? 'Invitación creada y correo transaccional enviado al buzón de pruebas de este ambiente.'
            : 'Invitación creada y correo transaccional enviado al residente.'
          : result.emailDelivery.status === 'failed'
            ? 'Invitación creada, pero el correo no pudo enviarse. Usa el enlace seguro de respaldo.'
            : 'Invitación creada. El envío automático está desactivado; usa el enlace seguro de respaldo.';
      await reloadInvitationListsAfterPersistedMutation(personId, selectionVersion, successMessage);
      if (!ownsOperation(personId, selectionVersion, operationId)) return;
      if (!result.auditPersisted) {
        setAuditPersistenceWarning(
          'El resultado del correo no pudo guardarse en la auditoría. Conserva el enlace y revisa la integración antes de reenviar.',
        );
      }
    } catch (requestError) {
      if (ownsOperation(personId, selectionVersion, operationId))
        showActionError(
          requestError instanceof Error ? requestError.message : 'No se pudo crear la invitación.',
        );
    } finally {
      finishOperation(operationId);
    }
  };

  const createInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await issueInvitation(inviteRole, inviteUnitId);
  };

  const confirmRevokeInvitation = async () => {
    if (!selected || !pendingRevoke) return;
    const personId = selected.id;
    const selectionVersion = selectionVersionRef.current;
    const operationId = beginOperation(`revoke:${pendingRevoke.id}`);
    clearActionFeedback();
    try {
      await revokeResidentInvitation(pendingRevoke.id);
      if (!ownsOperation(personId, selectionVersion, operationId)) return;
      setPendingRevoke(null);
      setLatestInvitation(null);
      await reloadInvitationListsAfterPersistedMutation(
        personId,
        selectionVersion,
        'Invitación revocada. Ese enlace ya no podrá utilizarse.',
      );
    } catch (requestError) {
      if (ownsOperation(personId, selectionVersion, operationId))
        showActionError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudo revocar la invitación.',
        );
    } finally {
      finishOperation(operationId);
    }
  };

  const copyLatestInvitation = async () => {
    if (!latestInvitation || !selected) return;
    const personId = selected.id;
    const selectionVersion = selectionVersionRef.current;
    try {
      await navigator.clipboard.writeText(latestInvitation.url);
      if (ownsSelection(personId, selectionVersion)) {
        setMessage('Enlace seguro copiado al portapapeles.');
      }
    } catch {
      if (ownsSelection(personId, selectionVersion)) {
        showActionError(
          'No se pudo copiar automáticamente. Selecciona el enlace y cópialo manualmente.',
        );
      }
    }
  };

  const saveAdminNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !adminNotesAuthorized) return;
    const content = adminNoteDraft.trim();
    if (!content) {
      setAdminNoteError(
        'Escribe una nota o usa “Limpiar nota” para conservar el cambio en el historial.',
      );
      adminNoteInputRef.current?.focus();
      return;
    }
    setAdminNoteError('');
    const personId = selected.id;
    const selectionVersion = selectionVersionRef.current;
    const operationId = beginOperation('admin-note');
    clearActionFeedback();
    setMessage('');
    try {
      await peopleApi(
        `/v1/condominiums/${condominiumId}/people/${selected.id}/admin-notes`,
        session,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        },
      );
      if (!ownsOperation(personId, selectionVersion, operationId)) return;
      await refreshAfterPersistedMutation(
        personId,
        selectionVersion,
        'Nota administrativa guardada. La revisión anterior permanece en el historial.',
      );
    } catch (requestError) {
      if (ownsOperation(personId, selectionVersion, operationId))
        showActionError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudo guardar la nota administrativa.',
        );
    } finally {
      finishOperation(operationId);
    }
  };

  const clearAdminNote = async () => {
    if (!selected || !adminNotesAuthorized) return;
    const personId = selected.id;
    const selectionVersion = selectionVersionRef.current;
    const operationId = beginOperation('clear-admin-note');
    clearActionFeedback();
    setMessage('');
    try {
      await peopleApi(
        `/v1/condominiums/${condominiumId}/people/${selected.id}/admin-notes/clear`,
        session,
        { method: 'POST' },
      );
      if (!ownsOperation(personId, selectionVersion, operationId)) return;
      await refreshAfterPersistedMutation(
        personId,
        selectionVersion,
        'Nota administrativa limpiada. El historial anterior se conserva.',
      );
    } catch (requestError) {
      if (ownsOperation(personId, selectionVersion, operationId))
        showActionError(
          requestError instanceof Error
            ? requestError.message
            : 'No se pudo limpiar la nota administrativa.',
        );
    } finally {
      finishOperation(operationId);
    }
  };

  const invitationUnitLabel = (unitId: string) => {
    const unit = units.find((item) => item.id === unitId);
    return unit ? directoryUnitLabel(unit, buildings) : 'Unidad no disponible';
  };

  const openInvitationFromRelationship = (relationship: PersonUnitRelationshipSummary) => {
    const role = relationship.accessRoles[0];
    if (!role) return;
    setInviteRole(role);
    setInviteUnitId(relationship.unitId);
    setTab('digital-access');
  };

  if (loading && !people.length && !directoryLoadError) {
    return (
      <div className="people-v3-workspace" aria-label="Cargando personas">
        <Skeleton className="skeleton--title" />
        <div className="people-v3-loading-grid">
          <Skeleton className="skeleton--card" />
          <Skeleton className="skeleton--card" />
        </div>
      </div>
    );
  }

  const renderSummary = () => (
    <div className="people-v3-tab-stack">
      <WorkspaceMetrics>
        <WorkspaceMetricCard
          detail="Vigentes ahora"
          icon={<UnitsIcon size={18} />}
          label="Relaciones con unidades"
          tone="blue"
          value={activeUnitRelationships.length}
        />
        <WorkspaceMetricCard
          detail="Junta, representación y contactos"
          icon={<PeopleIcon size={18} />}
          label="Roles activos"
          tone="neutral"
          value={activeCommunityRoles.length}
        />
        <WorkspaceMetricCard
          detail="Invitaciones esperando aceptación"
          icon={<BellIcon size={18} />}
          label="Accesos pendientes"
          tone={pendingInvitations.length ? 'green' : 'neutral'}
          value={pendingInvitations.length}
        />
      </WorkspaceMetrics>

      <WorkspaceSection
        actions={
          <Button onClick={() => setRelationTarget({})} size="sm" variant="secondary">
            Vincular unidad
          </Button>
        }
        description="Una tarjeta por unidad reúne la relación operativa sin mezclar sus entidades ni su historial."
        title="Relaciones actuales"
      >
        {activeUnitRelationships.length ? (
          <div className="people-v3-unit-list">
            {activeUnitRelationships.slice(0, 3).map((relationship) => (
              <PersonUnitRelationshipCard
                key={relationship.unitId}
                onHistory={() => setHistoryRelationship(relationship)}
                onInvite={
                  relationship.accessRoles.length
                    ? () => openInvitationFromRelationship(relationship)
                    : undefined
                }
                onManage={() => setRelationTarget({ unitId: relationship.unitId })}
                relationship={relationship}
              />
            ))}
            {activeUnitRelationships.length > 3 ? (
              <Button onClick={() => setTab('units')} type="button" variant="ghost">
                Ver las {activeUnitRelationships.length} relaciones con unidades
              </Button>
            ) : null}
          </div>
        ) : (
          <EmptyState
            actionLabel="Vincular unidad"
            description="La persona puede existir sin duplicarse y asociarse a una o varias unidades cuando corresponda."
            icon={<UnitsIcon size={26} />}
            onAction={() => setRelationTarget({})}
            title="Sin relaciones activas con unidades"
          />
        )}
      </WorkspaceSection>
    </div>
  );

  const renderUnits = () => (
    <WorkspaceSection
      actions={
        <Button onClick={() => setRelationTarget({})} size="sm">
          Vincular unidad
        </Button>
      }
      description="Propiedad, ocupación, comunicaciones y acceso se presentan juntas por unidad; sus ciclos históricos siguen separados."
      title="Relaciones con unidades"
    >
      {relationships.length ? (
        <div className="people-v3-unit-list">
          {relationships.map((relationship) => (
            <PersonUnitRelationshipCard
              key={relationship.unitId}
              onHistory={() => setHistoryRelationship(relationship)}
              onInvite={
                relationship.accessRoles.length
                  ? () => openInvitationFromRelationship(relationship)
                  : undefined
              }
              onManage={() => setRelationTarget({ unitId: relationship.unitId })}
              relationship={relationship}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          actionLabel="Vincular primera unidad"
          description="No hay propiedad, ocupación, comunicaciones ni invitaciones asociadas a una unidad."
          icon={<UnitsIcon size={26} />}
          onAction={() => setRelationTarget({})}
          title="Sin relaciones con unidades"
        />
      )}
    </WorkspaceSection>
  );

  const renderCommunityRoles = () => (
    <div className="people-v3-tab-stack">
      <WorkspaceSection
        description="Junta, administración, representación y contactos se administran aparte de la relación con unidades."
        title="Agregar rol en la comunidad"
      >
        <form
          className="people-v3-inline-form ux-form"
          noValidate
          onSubmit={(event) => void createCondominiumRelationship(event)}
        >
          <Field label="Relación">
            <Select
              onChange={(event) =>
                setRelationshipDraft((current) => ({
                  ...current,
                  relationshipType: event.target.value as CondominiumRelationshipType,
                }))
              }
              value={relationshipDraft.relationshipType}
            >
              {(
                Object.entries(condominiumRelationshipLabels) as [
                  CondominiumRelationshipType,
                  string,
                ][]
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cargo o detalle">
            <input
              className="input"
              maxLength={120}
              onChange={(event) =>
                setRelationshipDraft((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="Ej. Presidente de la junta"
              value={relationshipDraft.title}
            />
          </Field>
          <Button disabled={busyAction === 'condominium-relationship'} type="submit">
            {busyAction === 'condominium-relationship' ? 'Agregando…' : 'Agregar relación'}
          </Button>
        </form>
      </WorkspaceSection>

      <WorkspaceSection
        title="Historial de roles"
        description="Cerrar un rol conserva la historia y su fecha de vigencia."
      >
        {condominiumRelationships.length ? (
          <div className="people-v3-history__list">
            {condominiumRelationships.map((relationship) => {
              const current = !relationship.ends_at;
              return (
                <article key={relationship.id}>
                  <div>
                    <strong>{condominiumRelationshipLabels[relationship.relationship_type]}</strong>
                    <span>{relationship.title || 'Sin cargo adicional'}</span>
                    <small>
                      Desde {formatDate(relationship.starts_at)}
                      {relationship.ends_at ? ` · hasta ${formatDate(relationship.ends_at)}` : ''}
                    </small>
                  </div>
                  <Badge tone={current ? 'success' : 'neutral'}>
                    {current ? 'Actual' : 'Histórica'}
                  </Badge>
                  {current ? (
                    <Button
                      onClick={() =>
                        setPendingClose({
                          kind: 'condominium',
                          id: relationship.id,
                          label: condominiumRelationshipLabels[relationship.relationship_type],
                        })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Cerrar
                    </Button>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="people-v3-muted">Sin roles institucionales registrados.</p>
        )}
      </WorkspaceSection>
    </div>
  );

  const renderPrivateNotes = () => (
    <WorkspaceSection
      description="Solo personal autorizado para gestionar Personas puede ver estas notas. Nunca guardes contraseñas, tokens, datos de tarjeta ni otros secretos."
      eyebrow="Administración · privado"
      title="Notas internas"
    >
      {adminNotesAuthorized ? (
        <form
          className="people-v3-notes ux-form"
          noValidate
          onSubmit={(event) => void saveAdminNote(event)}
        >
          <Field
            hint="Máximo 4.000 caracteres. Cada guardado crea una nueva revisión auditable."
            error={adminNoteError}
            label="Nota administrativa"
          >
            <textarea
              className="input"
              maxLength={4000}
              onChange={(event) => {
                setAdminNoteDraft(event.target.value);
                if (adminNoteError) setAdminNoteError('');
              }}
              placeholder="Preferencia de contacto, seguimiento administrativo o contexto operativo…"
              ref={adminNoteInputRef}
              rows={6}
              value={adminNoteDraft}
            />
          </Field>
          <div className="people-v3-private-summary" role="note">
            <Badge tone="warning">Privado</Badge>
            <strong>{adminNoteRevisions.length} revisiones</strong>
            <span>
              {adminNoteRevisions[0]
                ? `Último cambio ${formatDate(adminNoteRevisions[0].created_at)}`
                : 'Sin notas administrativas registradas'}
            </span>
          </div>
          <div className="people-v3-action-row">
            <Button disabled={busyAction === 'admin-note'} type="submit">
              {busyAction === 'admin-note' ? 'Guardando…' : 'Guardar nota'}
            </Button>
            {adminNoteRevisions[0]?.action === 'saved' ? (
              <Button
                disabled={busyAction === 'clear-admin-note'}
                onClick={() => void clearAdminNote()}
                type="button"
                variant="ghost"
              >
                {busyAction === 'clear-admin-note' ? 'Limpiando…' : 'Limpiar nota'}
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <InlineNotice tone="info">
          Tu rol actual no tiene acceso a las notas administrativas privadas de esta persona.
        </InlineNotice>
      )}
    </WorkspaceSection>
  );

  const renderDigitalAccess = () => (
    <div className="people-v3-tab-stack">
      <WorkspaceSection
        description="El acceso se concede sólo desde una propiedad activa o una relación residencial activa y compatible con la unidad."
        title="Invitar a Habitta"
      >
        <form
          className="people-v3-access-form ux-form"
          noValidate
          onSubmit={(event) => void createInvitation(event)}
        >
          <Field label="Rol que recibirá">
            <Select
              onChange={(event) => setInviteRole(event.target.value as ResidentRole)}
              value={inviteRole}
            >
              <option value="owner">Propietario</option>
              <option value="tenant">Inquilino</option>
              <option value="family_member">Familiar</option>
              <option value="authorized_occupant">Ocupante autorizado</option>
            </Select>
          </Field>
          <Field label="Unidad vinculada">
            <Select onChange={(event) => setInviteUnitId(event.target.value)} value={inviteUnitId}>
              <option value="">Selecciona una unidad compatible</option>
              {inviteUnits.map((option) => (
                <option key={`${option.role}:${option.unitId}`} value={option.unitId}>
                  {option.unitLabel}
                </option>
              ))}
            </Select>
          </Field>
          <div className="people-v3-access-summary" role="note">
            <span>Se concederá acceso a</span>
            <strong>{condominiumName}</strong>
            <span>
              {inviteUnitId
                ? `${inviteUnits.find((option) => option.unitId === inviteUnitId)?.unitLabel ?? 'Unidad'} · ${residentRoleLabel(inviteRole)}`
                : 'Selecciona una relación activa'}
            </span>
          </div>
          <Button
            disabled={busyAction === 'invitation' || !selected?.email || !inviteUnitId}
            type="submit"
          >
            {busyAction === 'invitation' ? 'Creando…' : 'Crear invitación'}
          </Button>
        </form>

        {!selected?.email ? (
          <InlineNotice tone="info">
            Agrega un correo al perfil para habilitar invitaciones.
          </InlineNotice>
        ) : null}
        {selected?.email && !accessOptions.length ? (
          <InlineNotice tone="info">
            Registra primero una propiedad o una relación residencial activa compatible con la
            unidad.
          </InlineNotice>
        ) : null}
      </WorkspaceSection>

      {latestInvitation ? (
        <WorkspaceSection
          title="Enlace seguro listo"
          description="Habitta almacena sólo el hash del token; conserva este enlace únicamente para entregarlo al residente."
        >
          <div className="people-v3-invitation-link">
            <div>
              <strong>
                {residentRoleLabel(latestInvitation.role)} · {latestInvitation.unitLabel}
              </strong>
              <Badge
                tone={
                  latestInvitation.delivery.status === 'sent'
                    ? 'success'
                    : latestInvitation.delivery.status === 'failed'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {latestInvitation.delivery.status === 'sent'
                  ? 'Correo enviado'
                  : latestInvitation.delivery.status === 'failed'
                    ? 'Error de envío'
                    : 'Envío desactivado'}
              </Badge>
            </div>
            <input
              aria-label="Enlace seguro de invitación"
              className="input"
              readOnly
              value={latestInvitation.url}
            />
            <Button onClick={() => void copyLatestInvitation()} size="sm" type="button">
              Copiar enlace seguro
            </Button>
          </div>
        </WorkspaceSection>
      ) : null}

      <WorkspaceSection
        title="Historial de invitaciones"
        description={`${invitations.length} invitaciones registradas para esta persona.`}
      >
        {invitations.length ? (
          <div className="people-v3-history__list">
            {invitations.map((invitation) => {
              const displayStatus = residentInvitationDisplayStatus(invitation);
              const deliveryEvent = deliveryByInvitationId.get(invitation.id);
              const eligible = accessOptions.some(
                (option) =>
                  option.role === invitation.intended_role && option.unitId === invitation.unit_id,
              );
              return (
                <article key={invitation.id}>
                  <div>
                    <strong>
                      {residentRoleLabel(invitation.intended_role)} ·{' '}
                      {invitationUnitLabel(invitation.unit_id)}
                    </strong>
                    <span>{invitation.email}</span>
                    <small>
                      Creada {formatDate(invitation.created_at)} · vence{' '}
                      {formatDate(invitation.expires_at)}
                    </small>
                  </div>
                  <Badge tone={invitationTone(displayStatus)}>
                    {residentInvitationStatusLabels[displayStatus]}
                  </Badge>
                  <Badge tone={deliveryTone(deliveryEvent)}>
                    {residentDeliveryLabel(deliveryEvent)}
                  </Badge>
                  <div className="people-v3-action-row">
                    {displayStatus === 'pending' && eligible ? (
                      <Button
                        disabled={busyAction === 'invitation'}
                        onClick={() =>
                          void issueInvitation(invitation.intended_role, invitation.unit_id)
                        }
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Renovar enlace
                      </Button>
                    ) : null}
                    {displayStatus === 'pending' ? (
                      <Button
                        onClick={() => setPendingRevoke(invitation)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Revocar
                      </Button>
                    ) : null}
                    {(displayStatus === 'expired' || displayStatus === 'revoked') && eligible ? (
                      <Button
                        disabled={busyAction === 'invitation'}
                        onClick={() =>
                          void issueInvitation(invitation.intended_role, invitation.unit_id)
                        }
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Nueva invitación
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="people-v3-muted">No hay invitaciones registradas para esta persona.</p>
        )}
      </WorkspaceSection>
    </div>
  );

  const renderTab = () => {
    if (!selected) return null;
    if (tab === 'units') return renderUnits();
    if (tab === 'community-roles') return renderCommunityRoles();
    if (tab === 'private-notes') return renderPrivateNotes();
    if (tab === 'digital-access') return renderDigitalAccess();
    return renderSummary();
  };

  const profileUnavailableAfterLoadError = profileLoadError && !hasLoadedSelectedProfile;

  return (
    <>
      <div className="people-v3-workspace">
        <PageHeader
          actions={
            <div className="people-v3-page-actions">
              <Button onClick={() => setImportOpen(true)} variant="secondary">
                Importar CSV
              </Button>
              <Button onClick={() => setPersonEditor('create')}>
                <PeopleIcon size={17} /> Nueva persona
              </Button>
            </div>
          }
          description="Una identidad por persona. Propiedad, ocupación, comunicaciones y acceso permanecen auditables y se presentan por unidad."
          eyebrow={`Comunidad · ${condominiumName}`}
          title="Personas"
        />

        {error ? (
          <InlineNotice tone="error">
            {error}
            {selected && profileLoadError ? (
              <Button
                onClick={() => void retrySelectedProfile(selected.id, renderedSelectionVersion)}
                size="sm"
                type="button"
                variant="ghost"
              >
                Reintentar
              </Button>
            ) : null}
          </InlineNotice>
        ) : null}
        {directoryLoadError && people.length > 0 ? (
          <InlineNotice tone="error" title="No se pudo actualizar el directorio">
            {directoryLoadError}
            <Button onClick={() => void loadDirectory()} size="sm" type="button" variant="ghost">
              Reintentar
            </Button>
          </InlineNotice>
        ) : null}
        {invitationListReloadRetry ? (
          <InlineNotice tone="error">
            {invitationListReloadRetry.error}
            <Button
              onClick={() => void retryInvitationListReload()}
              size="sm"
              type="button"
              variant="ghost"
            >
              Reintentar lista
            </Button>
          </InlineNotice>
        ) : null}
        {auditPersistenceWarning ? (
          <InlineNotice tone="error" title="Advertencia de auditoría">
            {auditPersistenceWarning}
          </InlineNotice>
        ) : null}
        {message ? (
          <InlineNotice announce tone="success" title="Listo">
            {message}
          </InlineNotice>
        ) : null}

        <WorkspaceMetrics>
          <WorkspaceMetricCard
            icon={<PeopleIcon size={18} />}
            label="Personas"
            value={directoryLoadError && people.length === 0 ? '—' : people.length}
            detail="Registros únicos"
          />
          <WorkspaceMetricCard
            icon={<CheckCircleIcon size={18} />}
            label="Activas"
            value={directoryLoadError && people.length === 0 ? '—' : activePeople}
            detail="Vigentes en la comunidad"
            tone="green"
          />
          <WorkspaceMetricCard
            icon={<BellIcon size={18} />}
            label="Con contacto"
            value={directoryLoadError && people.length === 0 ? '—' : connectedPeople}
            detail="Correo o teléfono disponible"
            tone="neutral"
          />
        </WorkspaceMetrics>

        <div className="people-v3-layout">
          <PeopleDirectoryView
            countsUnavailable={Boolean(directoryLoadError && people.length === 0)}
            onClearFilters={() => {
              if (directoryLoadError && people.length === 0) {
                void loadDirectory(false);
                return;
              }
              setStatusFilter('');
            }}
            onQueryChange={setQuery}
            onSelect={(person, interaction) => void selectPerson(person, interaction)}
            onStatusFilterChange={setStatusFilter}
            people={filtered}
            totalPeople={people.length}
            emptyState={directoryEmptyState}
            query={query}
            selectedId={selected?.id}
            statusFilter={statusFilter}
          />

          <div className="people-v3-profile-anchor" ref={profileRevealRef}>
            <Surface aria-busy={detailLoading || undefined} className="people-v3-profile">
              {!selected && detailLoading ? (
                <div className="people-v3-profile-loading">
                  <Skeleton className="skeleton--title" />
                  <Skeleton className="skeleton--card" />
                </div>
              ) : selected && profileUnavailableAfterLoadError ? (
                <div className="people-v3-profile-loading" role="status">
                  <p>No se pudieron cargar los detalles del perfil.</p>
                  <Button
                    onClick={() => void retrySelectedProfile(selected.id, renderedSelectionVersion)}
                    size="sm"
                    type="button"
                  >
                    Reintentar
                  </Button>
                </div>
              ) : selected ? (
                <>
                  <PersonProfileHeader
                    actions={
                      shouldShowInitialProfileSkeleton(
                        detailLoading,
                        hasLoadedSelectedProfile,
                      ) ? undefined : (
                        <Button onClick={() => setRelationTarget({})} size="sm">
                          Vincular unidad
                        </Button>
                      )
                    }
                    onEdit={() => setPersonEditor('edit')}
                    onTabChange={setTab}
                    person={selected}
                    headingRef={profileHeadingRef}
                    tab={tab}
                  />
                  <div className="people-v3-tab-content" role="tabpanel">
                    {shouldShowInitialProfileSkeleton(detailLoading, hasLoadedSelectedProfile) ? (
                      <Skeleton className="skeleton--card" />
                    ) : (
                      renderTab()
                    )}
                  </div>
                </>
              ) : (
                <PeopleProfileEmpty onCreate={() => setPersonEditor('create')} />
              )}
            </Surface>
          </div>
        </div>
      </div>

      {personEditor ? (
        <PersonEditorDrawerV3
          buildings={buildings}
          condominiumId={condominiumId}
          onClose={() => setPersonEditor(null)}
          onSaved={handlePersonSaved}
          person={personEditor === 'edit' ? selected : null}
          session={session}
          units={units}
        />
      ) : null}

      {relationTarget && selected ? (
        <PersonUnitRelationshipDrawerV3
          buildings={buildings}
          condominiumId={condominiumId}
          initialUnitId={relationTarget.unitId}
          onChanged={async (successMessage) => {
            if (ownsSelection(selected.id, renderedSelectionVersion)) {
              await refreshAfterPersistedMutation(
                selected.id,
                renderedSelectionVersion,
                successMessage,
              );
            }
          }}
          onClose={() => {
            if (ownsSelection(selected.id, renderedSelectionVersion)) setRelationTarget(null);
          }}
          onRequestClose={(target) => {
            if (ownsSelection(selected.id, renderedSelectionVersion)) setPendingClose(target);
          }}
          person={selected}
          relationships={relationships}
          session={session}
          units={units}
        />
      ) : null}

      {historyRelationship ? (
        <PersonRelationshipHistoryDrawerV3
          onClose={() => setHistoryRelationship(null)}
          relationship={historyRelationship}
        />
      ) : null}

      {importOpen ? (
        <PeopleImportDrawerV3
          condominiumId={condominiumId}
          onClose={() => setImportOpen(false)}
          onImported={async (successMessage) => {
            setImportOpen(false);
            await loadDirectory();
            setMessage(successMessage);
          }}
          session={session}
        />
      ) : null}

      {pendingClose ? (
        <ConfirmDialog
          busy={busyAction === `close:${pendingClose.id}`}
          busyLabel="Cerrando relación…"
          confirmLabel="Cerrar relación"
          description={`${pendingClose.label} dejará de estar activa desde hoy. Habitta conservará el registro histórico y cualquier nueva relación deberá registrarse explícitamente.`}
          onCancel={() => !busyAction && setPendingClose(null)}
          onConfirm={() => void confirmCloseRelationship()}
          title="Cerrar relación activa"
        />
      ) : null}

      {pendingRevoke ? (
        <ConfirmDialog
          busy={busyAction === `revoke:${pendingRevoke.id}`}
          busyLabel="Revocando…"
          confirmLabel="Revocar invitación"
          description={`El enlace pendiente de ${residentRoleLabel(pendingRevoke.intended_role).toLowerCase()} para ${invitationUnitLabel(pendingRevoke.unit_id)} dejará de ser válido. La persona y su relación con la unidad no se eliminan.`}
          destructive
          onCancel={() => !busyAction && setPendingRevoke(null)}
          onConfirm={() => void confirmRevokeInvitation()}
          title="Revocar acceso pendiente"
        />
      ) : null}
    </>
  );
}
