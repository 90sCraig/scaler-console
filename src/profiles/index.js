import { vp728 } from './vp-728.js';
import { vp729 } from './vp-729.js';
import { vp773, vp773a, vp773amp } from './vp-773.js';

const supportedProfiles = [vp729, vp728, vp773a, vp773, vp773amp];
const profiles = new Map(supportedProfiles.map((profile) => [profile.id, profile]));

export function listProfiles() {
  return [...profiles.values()];
}

export function getProfile(id) {
  return profiles.get(id);
}
