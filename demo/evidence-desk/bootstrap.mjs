// Standalone source package lifecycle. No application/backend inventory or blog build.
// Third-party dependency lifecycle scripts still run under normal npm ci.
import { generateDemoAssets } from './generate-assets.mjs';
generateDemoAssets();
