export type MyMonitorDeploymentProfile = 'standard' | 'personal';

export type PersonalCapabilityAvailability =
  | 'AVAILABLE_LOCAL'
  | 'NEEDS_PROVIDER_KEY'
  | 'NEEDS_LOCAL_LLM'
  | 'HOSTED_ONLY'
  | 'DISABLED_PERSONAL';

export interface MyMonitorCapability {
  availability: PersonalCapabilityAvailability;
  enabled: boolean;
}

export interface MyMonitorDeploymentPolicy {
  profile: MyMonitorDeploymentProfile;
  capabilities: Record<string, MyMonitorCapability>;
  ui: {
    showSaasSurfaces: boolean;
    showVariantNavigation: boolean;
  };
  loading: {
    mode: 'standard' | 'performance';
    p0PanelLimit?: number;
  };
}

export type DeploymentProfileAuthority = 'default' | 'build-hint' | 'server';

const STANDARD_POLICY: MyMonitorDeploymentPolicy = {
  profile: 'standard',
  capabilities: {},
  ui: { showSaasSurfaces: true, showVariantNavigation: true },
  loading: { mode: 'standard' },
};

const PERSONAL_HINT_POLICY: MyMonitorDeploymentPolicy = {
  profile: 'personal',
  capabilities: {},
  ui: { showSaasSurfaces: false, showVariantNavigation: false },
  loading: { mode: 'performance', p0PanelLimit: 12 },
};

function hasPersonalBuildHint(): boolean {
  try {
    return import.meta.env.VITE_MYMONITOR_PROFILE?.trim().toLowerCase() === 'personal';
  } catch {
    return false;
  }
}

let currentPolicy: MyMonitorDeploymentPolicy = hasPersonalBuildHint()
  ? PERSONAL_HINT_POLICY
  : STANDARD_POLICY;
let currentAuthority: DeploymentProfileAuthority = hasPersonalBuildHint()
  ? 'build-hint'
  : 'default';

function isCapability(value: unknown): value is MyMonitorCapability {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MyMonitorCapability>;
  return typeof candidate.enabled === 'boolean' && (
    candidate.availability === 'AVAILABLE_LOCAL'
    || candidate.availability === 'NEEDS_PROVIDER_KEY'
    || candidate.availability === 'NEEDS_LOCAL_LLM'
    || candidate.availability === 'HOSTED_ONLY'
    || candidate.availability === 'DISABLED_PERSONAL'
  );
}

export function applyServerDeploymentProfile(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MyMonitorDeploymentPolicy>;
  if (candidate.profile !== 'standard' && candidate.profile !== 'personal') return false;

  const capabilities = Object.fromEntries(
    Object.entries(candidate.capabilities ?? {}).filter((entry): entry is [string, MyMonitorCapability] => (
      isCapability(entry[1])
    )),
  );
  const personal = candidate.profile === 'personal';
  currentPolicy = {
    profile: candidate.profile,
    capabilities,
    ui: {
      showSaasSurfaces: personal ? false : candidate.ui?.showSaasSurfaces !== false,
      showVariantNavigation: personal ? false : candidate.ui?.showVariantNavigation !== false,
    },
    loading: {
      mode: personal ? 'performance' : 'standard',
      ...(personal && Number.isInteger(candidate.loading?.p0PanelLimit)
        ? { p0PanelLimit: candidate.loading!.p0PanelLimit }
        : {}),
    },
  };
  currentAuthority = 'server';
  return true;
}

export function getDeploymentProfileAuthority(): DeploymentProfileAuthority {
  return currentAuthority;
}

export function getMyMonitorDeploymentPolicy(): MyMonitorDeploymentPolicy {
  return {
    ...currentPolicy,
    capabilities: { ...currentPolicy.capabilities },
    ui: { ...currentPolicy.ui },
    loading: { ...currentPolicy.loading },
  };
}

export function isPersonalDeployment(): boolean {
  return currentPolicy.profile === 'personal';
}

export function getMyMonitorCapabilities(): Record<string, MyMonitorCapability> {
  return { ...currentPolicy.capabilities };
}

// Personal capability decisions are affirmative only when they came from the
// server bootstrap. The Vite hint can suppress SaaS UI before App construction,
// but it can never grant access or stand in for an entitlement.
export function getPersonalEntitlement(capability: string): boolean {
  return currentAuthority === 'server'
    && currentPolicy.profile === 'personal'
    && currentPolicy.capabilities[capability]?.enabled === true;
}

export const __testing__ = {
  reset(policy: MyMonitorDeploymentPolicy = STANDARD_POLICY): void {
    currentPolicy = policy;
    currentAuthority = 'default';
  },
};
