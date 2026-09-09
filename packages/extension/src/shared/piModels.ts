import { type CredentialStore, type MutableModels } from '@earendil-works/pi-ai';
import { builtinModels } from '@earendil-works/pi-ai/providers/all';

// pi-ai wires OAuth login/refresh into its builtin providers directly
// (lazyOAuth), so the models collection only needs the credential store.
export function createPiModels(credentials?: CredentialStore): MutableModels {
  return builtinModels(credentials ? { credentials } : undefined);
}
