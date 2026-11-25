// Public snapshot client contract for the existing api.js references.
// This is not a generated/validated server API, nor an operational backend.
import type { FunctionReference } from 'convex/server';
import type { GenericId } from 'convex/values';
export type Id<TableName extends 'businessProGrants'> = GenericId<TableName>;
import type { SubscriptionInfo, ListBusinessSeatsResult } from '../services/billing';
import type { EntitlementState } from '../services/entitlements';
import type { ApiKeyInfo } from '../services/api-keys';
// Client-only types for the public snapshot's existing followed-countries consumer.
export type FollowMutationResult =
  | { ok: true; idempotent: boolean }
  | { ok: false; reason: 'FREE_CAP'; currentCount: number; limit: number };
export interface MergeAnonymousLocalResult {
  accepted: string[];
  droppedDueToCap: string[];
}

export interface PublicClientApi {
  users: {
    ensureRecord: FunctionReference<'mutation', 'public', {
      localeTag: string; localePrimary: string; timezone?: string; country?: string;
    }, { ok: boolean }>;
  };
  entitlements: {
    getEntitlementsForUser: FunctionReference<'query', 'public', Record<string, never>, EntitlementState | null>;
  };
  followedCountries: {
    followCountry: FunctionReference<'mutation', 'public', { country: string }, FollowMutationResult>;
    unfollowCountry: FunctionReference<'mutation', 'public', { country: string }, { ok: true; idempotent: boolean }>;
    mergeAnonymousLocal: FunctionReference<'mutation', 'public', { countries: string[] }, MergeAnonymousLocalResult>;
    listFollowed: FunctionReference<'query', 'public', Record<string, never>, string[]>;
  };
  apiKeys: {
    createApiKey: FunctionReference<'mutation', 'public', { name: string; keyPrefix: string; keyHash: string }, Pick<ApiKeyInfo, 'id' | 'name' | 'keyPrefix'>>;
    listApiKeys: FunctionReference<'query', 'public', Record<string, never>, ApiKeyInfo[]>;
    revokeApiKey: FunctionReference<'mutation', 'public', { keyId: string }, { keyHash?: string } | null>;
  };
  payments: {
    billing: {
      getSubscriptionForUser: FunctionReference<'query', 'public', Record<string, never>, SubscriptionInfo | null>;
      claimSubscription: FunctionReference<'mutation', 'public', { anonId: string; claimToken?: string }, { claimed: { subscriptions: number; entitlements: number; customers: number; payments: number } }>;
      getCustomerPortalUrl: FunctionReference<'action', 'public', Record<string, never>, { portal_url?: string } | null>;
    };
    businessSeats: {
      listSeats: FunctionReference<'query', 'public', Record<string, never>, ListBusinessSeatsResult>;
      inviteSeats: FunctionReference<'mutation', 'public', { emails: string[] }, { invited: Array<{ email: string; grantId: string; status: 'created' | 'already_pending' | 'already_accepted' }> }>;
      removeSeat: FunctionReference<'mutation', 'public', { grantId: Id<'businessProGrants'> }, { ok: true; status: 'revoked' | 'already_inactive' }>;
      acceptBusinessInvite: FunctionReference<'mutation', 'public', { grantId: Id<'businessProGrants'>; token: string }, unknown>;
    };
  };
};
