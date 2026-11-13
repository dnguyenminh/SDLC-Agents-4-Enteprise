"use strict";
/**
 * TypeScript interfaces for Impeccable design detection integration.
 *
 * Defines the data models for findings, reports, detection results,
 * and the service interfaces used across all components.
 *
 * Security conditions from SECURITY-REVIEW.md C5-C6 are enforced
 * in the report sanitization and error wrapping logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvConfig = exports.DetectionErrorException = exports.DetectionError = void 0;
exports.createDetectionError = createDetectionError;
/** Error types for the design gate */
var DetectionError;
(function (DetectionError) {
    DetectionError["WASM_INCOMPATIBLE"] = "WASM_INCOMPATIBLE";
    DetectionError["PACKAGE_NOT_FOUND"] = "PACKAGE_NOT_FOUND";
    DetectionError["INVALID_PATH"] = "INVALID_PATH";
    DetectionError["TIMEOUT"] = "TIMEOUT";
    DetectionError["FETCH_FAILED"] = "FETCH_FAILED";
    DetectionError["DEV_SERVER_UNREACHABLE"] = "DEV_SERVER_UNREACHABLE";
    DetectionError["ERROR_LEAK"] = "ERROR_LEAK";
})(DetectionError || (exports.DetectionError = DetectionError = {}));
/** Custom error class for detection errors */
class DetectionErrorException extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "DetectionError";
    }
}
exports.DetectionErrorException = DetectionErrorException;
/** Helper functions to create detection errors */
function createDetectionError(code, message) {
    return new DetectionErrorException(code, message);
}
/** Environment configuration keys (from DPG.md) */
var EnvConfig;
(function (EnvConfig) {
    EnvConfig["IMPPECABLE_SKILL_PATH"] = "IMPPECABLE_SKILL_PATH";
    EnvConfig["QUALITY_GATE_THRESHOLD"] = "QUALITY_GATE_THRESHOLD";
    EnvConfig["DESIGN_DETECTION_MODE"] = "DESIGN_DETECTION_MODE";
    EnvConfig["LOCALHOST_DEV_SERVER_URL"] = "LOCALHOST_DEV_SERVER_URL";
    EnvConfig["WORKSPACE_ROOT"] = "WORKSPACE_ROOT";
})(EnvConfig || (exports.EnvConfig = EnvConfig = {}));
//# sourceMappingURL=types.js.map