// SPDX-License-Identifier: AGPL-3.0-only
// Compatibility facade; each settings area owns its UI and uses existing commands.
import {mountAppearance} from './appearance-ui.js';
import {mountModelProfiles} from './model-profiles-ui.js';
export {applyAppearance} from './appearance-ui.js';
export function mountPreferences(options){
 const appearance=mountAppearance(options),models=mountModelProfiles(options);
 return {async refresh(prefs){await appearance.refresh();await models.refresh(prefs);}};
}
