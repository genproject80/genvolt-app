# EMQX `decoder` Service Account Changes

This note documents the changes needed if you want to use `decoder` as a service account for subscribing to `cloudsynk/+/telemetry`.

No code changes are currently applied. This file is only a guide.

## Why `decoder` is denied now

In the current backend ACL hook, only `process.env.MQTT_BACKEND_USER` is treated as a service account.

File:
- `genvolt-app/server/routes/mqttAuthRoutes.js`

Current line to look for:

```js
const SERVICE_ACCOUNTS = new Set([process.env.MQTT_BACKEND_USER].filter(Boolean));
```

Because `decoder` is not in that set, the HTTP ACL hook treats it like a device username and denies wildcard subscribe requests such as:

```text
cloudsynk/+/telemetry
```

## File Changes Needed

### 1. Update service-account handling in the backend ACL hook

File:
- `genvolt-app/server/routes/mqttAuthRoutes.js`

Section:
- Near the top of the file, under the comment:
  `Service accounts are authenticated by EMQX built-in database`

Replace:

```js
const SERVICE_ACCOUNTS = new Set([process.env.MQTT_BACKEND_USER].filter(Boolean));
```

With:

```js
const SERVICE_ACCOUNTS = new Set(
  [
    process.env.MQTT_BACKEND_USER,
    ...(process.env.MQTT_SERVICE_ACCOUNTS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  ].filter(Boolean)
);
```

Effect:
- Keeps `backend_publisher` working as before
- Lets you add extra service users like `decoder` through env

### 2. Add the extra service account to env

File:
- `genvolt-app/server/.env`

Section:
- MQTT settings block

Add this line below `MQTT_BACKEND_PASSWORD`:

```env
MQTT_SERVICE_ACCOUNTS=decoder
```

If you later need more than one extra service account:

```env
MQTT_SERVICE_ACCOUNTS=decoder,local_subscriber
```

## EMQX Changes Needed

These changes are required in EMQX even after the backend code/env changes.

### 1. Create the `decoder` user in EMQX Built-in Database

EMQX Dashboard path:
- `Access Control -> Authentication -> Built-in Database -> Users`

Add:
- Username: `decoder`
- Password: choose a password and keep it for MQTTX
- `is_superuser`: `false`

### 2. Make sure authentication order is correct

Recommended order:
1. HTTP authenticator
2. Built-in Database authenticator

Why:
- Devices should still authenticate through the HTTP hook
- Service accounts like `decoder` should fall through to the Built-in Database

### 3. Authorization behavior

Your current backend code already allows any username present in `SERVICE_ACCOUNTS` inside:
- `POST /api/mqtt/acl`

That means once `decoder` is recognized as a service account, the HTTP ACL hook will return `allow`.

So, with the backend code change in place, built-in authorization rules for `decoder` are optional.

If you want a built-in fallback rule in EMQX as well, add:
- `Allow SUBSCRIBE` on `cloudsynk/+/telemetry`

Optional additional rules depending on use:
- `Allow SUBSCRIBE` on `cloudsynk/pre-activation`
- `Allow PUBLISH` on `cloudsynk/+/config`

## MQTTX Test Settings

After making the changes:

- Username: `decoder`
- Password: the password created in EMQX Built-in Database
- Topic to subscribe: `cloudsynk/+/telemetry`

## Restart Required

After updating `server/.env`, restart the backend service so the env is reloaded.

## Files Involved

- `genvolt-app/server/routes/mqttAuthRoutes.js`
- `genvolt-app/server/.env`
- EMQX Dashboard:
  - Authentication -> Built-in Database -> Users
  - Authentication ordering
  - Optional Authorization rules
