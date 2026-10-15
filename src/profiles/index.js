import { vp729 } from './vp-729.js';

const profiles = new Map([[vp729.id, vp729]]);

export function listProfiles() {
  return [...profiles.values()];
}

export function getProfile(id) {
  return profiles.get(id);
}

