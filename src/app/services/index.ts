/*
 * Services Barrel Export
 * All HTTP calls go through the auto-generated SDK (app/api/).
 * Never import ApiService or AuthApiService — they have been removed.
 */

// Core UI services (no API calls)
export { LoadingService } from './loading.service';
export { IconService } from './icon.service';

// KYC
export { KycService } from './kyc.service';
export type { KycChallenge, KycChallengeResponse, KycSessionResponse, KycMobileLinkResponse, KycMobileTokenResponse } from './kyc.service';

// Contractor session & API
export { ContractorSessionService } from './contractor-session.service';
export { ContractorApiService } from './contractor-api.service';
