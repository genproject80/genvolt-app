# HKMI Device Config - Input Validation

**Date:** 2026-04-07 14:04:05

## Summary

Added max value validation to all three config fields in the **Send New Config** form on the HKMI Device Config dashboard page.

## Validation Rules

| Field              | Max Value | Notes                  |
|--------------------|-----------|------------------------|
| Motor ON Time (sec)  | 20        | Max 20 seconds         |
| Motor OFF Time (min) | 1440      | Max 24 hours (1440 min)|
| Wheel Threshold      | 99        | Max 99                 |

## Changes Made

**File:** `client/src/components/dashboard/HKMIDeviceConfig.jsx`

### 1. Field Max Configuration
- Added a `FIELD_MAX` lookup object that maps each field name to its maximum allowed value.
- Single source of truth for all max constraints — adding a new field only requires one entry.

### 2. Live Input Validation (on change)
- `handleFormChange` reads from `FIELD_MAX` dynamically.
- If the entered value exceeds the max, the input border turns red and an inline error message is shown below the field.
- Error clears automatically when the value is corrected.

### 3. Submit Validation (Save & Publish)
- `handlePublish` iterates over all fields with max rules before calling the API.
- If any field exceeds its max, submission is blocked and a banner error message is displayed (e.g., "Motor ON Time cannot exceed 20 seconds").

### 4. HTML max Attribute
- The `ConfigInput` component now accepts a `max` prop, which sets the native HTML `max` attribute on the `<input type="number">` element for browser-level enforcement.

### 5. Error State Cleanup
- `fieldErrors` state is reset when switching devices or clearing the selection.

## Three Layers of Validation

1. **HTML `max` attribute** — browser-native tooltip and form validation
2. **Live onChange validation** — immediate red border + inline error as the user types
3. **handlePublish guard** — blocks API call and shows banner message on submit
