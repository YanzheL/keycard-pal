// Node's type stripping resolves `./attestation` only as `./attestation.ts`, which src/ never writes.
import { register } from 'node:module';

register('./ts-imports-hooks.mjs', import.meta.url);
