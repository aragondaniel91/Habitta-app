export type OnboardingRequest = {
  path: '/v1/organizations' | '/v1/condominiums';
  body: Record<string, string>;
};

export function buildOnboardingRequest({
  organizationId,
  organizationName,
  condominiumName,
}: {
  organizationId: string;
  organizationName: string;
  condominiumName: string;
}): OnboardingRequest {
  if (organizationId) {
    return {
      path: '/v1/condominiums',
      body: { organizationId, name: condominiumName.trim() },
    };
  }

  return {
    path: '/v1/organizations',
    body: {
      name: organizationName.trim(),
      condominiumName: condominiumName.trim(),
    },
  };
}
