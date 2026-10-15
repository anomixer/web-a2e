/*
 * build-id.js - Which build of the stable-named files this page belongs with
 *
 * Written by
 *  Mike Daley <michael_daley@icloud.com>
 */

import { VERSION } from "./version.js";

/*
 * A hash of the WASM core, the workers, the shaders and the library list,
 * computed by vite.config.js when the app is built. Files at fixed URLs are
 * asked for with ?v=BUILD_ID so that a deploy changing any of them is fetched
 * afresh. Outside a Vite build (the tests) it falls back to the version.
 */
// eslint-disable-next-line no-undef
export const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : VERSION;
